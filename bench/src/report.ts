import { lineChart, type ChartSeries } from "./charts.js";
import { mean } from "./stats.js";
import type { BoardResult, GrowthResult, OfflineResult, TypingResult } from "./scenarios.js";

export interface BenchRun {
  meta: {
    startedAt: string;
    node: string;
    platform: string;
    cpu: string;
    cpuCount: number;
    memoryGb: number;
    config: Record<string, unknown>;
  };
  typing: TypingResult[];
  offline: OfflineResult[];
  board: BoardResult[];
  growth: GrowthResult[];
}

/** Above this event-loop lag in the bot processes the load generator, not the server, is the bottleneck. */
export const RIG_LAG_LIMIT_MS = 100;

const COLORS = { yjs: "#2563eb", sharedb: "#dc2626" } as const;
const NAMES = { yjs: "Yjs (CRDT)", sharedb: "ShareDB (OT)" } as const;

type SystemId = keyof typeof COLORS;

function group<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

function avg<T>(rows: T[], pick: (row: T) => number) {
  return mean(rows.map(pick));
}

const fmt = (value: number, digits = 1) => value.toFixed(digits);

function spread<T>(rows: T[], pick: (row: T) => number, digits = 1) {
  const values = rows.map(pick);
  return `${fmt(Math.min(...values), digits)}–${fmt(Math.max(...values), digits)}`;
}

function numeric(values: string[]) {
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
}

function typingSeries(
  rows: TypingResult[],
  mode: string,
  pick: (row: TypingResult) => number,
  dashed = false,
  labelSuffix = "",
): ChartSeries[] {
  return (Object.keys(COLORS) as SystemId[]).map((system) => {
    const bySize = group(
      rows.filter((r) => r.system === system && r.mode === mode),
      (r) => String(r.clients),
    );
    return {
      name: `${NAMES[system]}${labelSuffix}`,
      color: COLORS[system],
      dashed,
      points: numeric([...bySize.keys()]).map((x) => ({ x, y: avg(bySize.get(x)!, pick) })),
    };
  });
}

export function buildCharts(run: BenchRun): Record<string, string> {
  const charts: Record<string, string> = {};
  const t = run.typing;

  charts["typing-latency-p95-spread.svg"] = lineChart({
    title: "Задержка синхронизации p95 — правки в разных местах",
    xLabel: "Число пользователей N",
    yLabel: "мс",
    series: typingSeries(t, "spread", (r) => r.latencyMs.p95),
  });
  charts["typing-latency-p95-same.svg"] = lineChart({
    title: "Задержка синхронизации p95 — все правят одну позицию",
    xLabel: "Число пользователей N",
    yLabel: "мс",
    series: typingSeries(t, "samePosition", (r) => r.latencyMs.p95),
  });
  charts["server-cpu.svg"] = lineChart({
    title: "Загрузка CPU сервера (одно ядро = 100%)",
    xLabel: "Число пользователей N",
    yLabel: "%",
    series: typingSeries(t, "spread", (r) => r.serverCpuPercent),
  });
  charts["server-memory.svg"] = lineChart({
    title: "Пиковая память процесса сервера (RSS)",
    xLabel: "Число пользователей N",
    yLabel: "МБ",
    series: typingSeries(t, "spread", (r) => r.serverPeakRssMb),
  });
  charts["traffic-per-edit.svg"] = lineChart({
    title: "Трафик на одну правку (все клиенты, вход + выход)",
    xLabel: "Число пользователей N",
    yLabel: "байт",
    series: typingSeries(t, "spread", (r) => r.bytesPerEdit),
  });

  charts["offline-merge.svg"] = lineChart({
    title: "Время слияния после офлайна",
    xLabel: "Правок у офлайн-клиента (и столько же у остальных)",
    yLabel: "мс",
    series: (Object.keys(COLORS) as SystemId[]).map((system) => {
      const byK = group(
        run.offline.filter((r) => r.system === system),
        (r) => String(r.offlineEdits),
      );
      return {
        name: NAMES[system],
        color: COLORS[system],
        points: numeric([...byK.keys()]).map((x) => ({ x, y: avg(byK.get(x)!, (r) => r.mergeMs) })),
      };
    }),
  });

  for (const ratio of [...new Set(run.growth.map((r) => r.deleteRatio))].sort()) {
    const rows = run.growth.filter((r) => r.deleteRatio === ratio);
    const edits = numeric(rows.map((r) => String(r.edits)));
    const pick = (system: string, f: (r: GrowthResult) => number) =>
      edits.map((x) => {
        const row = rows.find((r) => r.system === system && String(r.edits) === x);
        return { x, y: row ? f(row) : 0 };
      });
    charts[`document-size-del${Math.round(ratio * 100)}.svg`] = lineChart({
      title: `Размер документа после N правок (удалений ${Math.round(ratio * 100)}%)`,
      xLabel: "Число правок",
      yLabel: "байт (лог. шкала)",
      logY: true,
      series: [
        { name: "Yjs: состояние", color: COLORS.yjs, points: pick("yjs", (r) => r.docSize.snapshotBytes) },
        {
          name: "ShareDB: снимок",
          color: COLORS.sharedb,
          dashed: true,
          points: pick("sharedb", (r) => r.docSize.snapshotBytes),
        },
        {
          name: "ShareDB: снимок + журнал",
          color: COLORS.sharedb,
          points: pick("sharedb", (r) => r.docSize.snapshotBytes + r.docSize.historyBytes),
        },
        { name: "Чистый текст", color: "#64748b", dashed: true, points: pick("yjs", (r) => r.textBytes) },
      ],
    });
  }

  charts["board-latency-p95.svg"] = lineChart({
    title: "Доска: задержка p95 при перемещении фигур",
    xLabel: "Число пользователей N",
    yLabel: "мс",
    series: (["ownShape", "sameShape"] as const).flatMap((mode) =>
      (Object.keys(COLORS) as SystemId[]).map((system) => {
        const bySize = group(
          run.board.filter((r) => r.system === system && r.mode === mode),
          (r) => String(r.clients),
        );
        return {
          name: `${NAMES[system]}, ${mode === "ownShape" ? "свои фигуры" : "одна фигура"}`,
          color: COLORS[system],
          dashed: mode === "sameShape",
          points: numeric([...bySize.keys()]).map((x) => ({ x, y: avg(bySize.get(x)!, (r) => r.latencyMs.p95) })),
        };
      }),
    ),
  });

  return charts;
}

function table(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function buildReport(run: BenchRun): string {
  const lines: string[] = [];
  const config = run.meta.config as {
    reps?: number;
    typingDurationMs?: number;
    editsPerSecondPerClient?: number;
  };

  lines.push("# Результаты стенда: CRDT (Yjs) против OT (ShareDB)", "");
  lines.push(
    `Запуск: ${run.meta.startedAt}. Node ${run.meta.node}, ${run.meta.platform}, ${run.meta.cpu} (${run.meta.cpuCount} потоков), ${run.meta.memoryGb} ГБ ОЗУ. ` +
      `Повторов на точку: ${config.reps ?? "?"}; длительность набора: ${(config.typingDurationMs ?? 0) / 1000} с; ` +
      `скорость набора: ${config.editsPerSecondPerClient ?? "?"} правок/с на пользователя.`,
    "",
  );
  lines.push(
    "Сервер каждой системы запускается отдельным процессом (чтобы честно измерить его CPU и память), а боты-клиенты работают в отдельных процессах (до 8, по 12 клиентов на процесс), чтобы генератор нагрузки не стал узким местом. Задержка измеряется от вызова вставки у автора до появления правки у другого клиента (общие часы машины). " +
      "Серверы сравниваются без базы данных: Hocuspocus в памяти и ShareDB с in-memory хранилищем, то есть сравнивается сам алгоритм синхронизации, а не слой хранения.",
    "",
  );

  lines.push("## 1. Одновременный набор: задержка, корректность, нагрузка", "");
  for (const [mode, title] of [
    ["spread", "Правки в разных местах файла"],
    ["samePosition", "Все вставляют в одну и ту же позицию (максимум конфликтов)"],
  ] as const) {
    lines.push(`### ${title}`, "");
    const rows: string[][] = [];
    const bySize = group(
      run.typing.filter((r) => r.mode === mode),
      (r) => String(r.clients),
    );
    for (const n of numeric([...bySize.keys()])) {
      for (const system of Object.keys(COLORS) as SystemId[]) {
        const runs = bySize.get(n)!.filter((r) => r.system === system);
        if (runs.length === 0) continue;
        rows.push([
          n,
          NAMES[system],
          fmt(avg(runs, (r) => r.latencyMs.mean)),
          fmt(avg(runs, (r) => r.latencyMs.p50)),
          fmt(avg(runs, (r) => r.latencyMs.p95)),
          spread(runs, (r) => r.latencyMs.p95),
          fmt(avg(runs, (r) => r.latencyMs.p99)),
          fmt(avg(runs, (r) => r.serverCpuPercent), 0),
          fmt(avg(runs, (r) => r.serverPeakRssMb), 0),
          fmt(avg(runs, (r) => r.bytesPerEdit), 0),
          runs.every((r) => r.converged && r.allEditsPresent) ? "да" : "НЕТ",
          runs.every((r) => r.clientEventLoopP99Ms < RIG_LAG_LIMIT_MS) ? "да" : "НЕТ (стенд упёрся)",
        ]);
      }
    }
    lines.push(
      table(
        ["N", "Система", "ср. мс", "p50", "p95", "p95, разброс повторов", "p99", "CPU сервера, %", "RSS, МБ", "байт/правку", "Сошлись, ничего не потеряно", "Стенд не перегружен"],
        rows,
      ),
      "",
    );
  }
  lines.push(
    "![p95, разные места](charts/typing-latency-p95-spread.svg)",
    "![p95, одна позиция](charts/typing-latency-p95-same.svg)",
    "![CPU](charts/server-cpu.svg)",
    "![Память](charts/server-memory.svg)",
    "![Трафик](charts/traffic-per-edit.svg)",
    "",
  );

  lines.push(
    `Контроль измерения: колонка «Стенд не перегружен» — задержка цикла событий (p99) в процессах с ботами меньше ${RIG_LAG_LIMIT_MS} мс. ` +
      "Если она превышена, измеренная задержка отражает перегрузку генератора нагрузки, а не сервера, и такую точку нельзя трактовать как свойство алгоритма. " +
      "Фоновое значение на этой машине около 20–25 мс (гранулярность таймеров Windows).",
    "",
  );

  lines.push("## 2. Работа офлайн", "");
  const offlineRows: string[][] = [];
  const byK = group(run.offline, (r) => String(r.offlineEdits));
  for (const k of numeric([...byK.keys()])) {
    for (const system of Object.keys(COLORS) as SystemId[]) {
      const runs = byK.get(k)!.filter((r) => r.system === system);
      if (runs.length === 0) continue;
      offlineRows.push([
        k,
        NAMES[system],
        fmt(avg(runs, (r) => r.mergeMs), 0),
        spread(runs, (r) => r.mergeMs, 0),
        fmt(avg(runs, (r) => r.bytesDuringMerge / 1024), 1),
        runs.every((r) => r.converged && r.allEditsPresent) ? "да" : "НЕТ",
      ]);
    }
  }
  lines.push(
    "Один клиент отключается, делает K правок локально, остальные в это время делают ещё K правок; затем клиент возвращается. Время отсчитывается от момента переподключения до совпадения текста у всех.",
    "",
    table(["K", "Система", "Слияние, мс", "Разброс повторов, мс", "Трафик при слиянии, КБ", "Сошлись, ничего не потеряно"], offlineRows),
    "",
    "![Слияние после офлайна](charts/offline-merge.svg)",
    "",
  );

  lines.push("## 3. Размер документа", "");
  lines.push(
    "Пять клиентов делают заданное число правок (вставка одного символа или удаление 1–5 символов в случайном месте). " +
      "«Чтобы открыть» — сколько байт должен получить клиент, подключающийся к документу (у Yjs это всё состояние, у ShareDB — снимок). " +
      "«Хранится всего» — у ShareDB добавляется журнал операций, из которого можно восстановить любую версию; у Yjs истории версий нет, зато есть метки удалённого.",
    "",
  );
  for (const ratio of [...new Set(run.growth.map((r) => r.deleteRatio))].sort()) {
    const rows = run.growth.filter((r) => r.deleteRatio === ratio);
    lines.push(
      `### Доля удалений ${Math.round(ratio * 100)}%`,
      "",
      table(
        ["Правок", "Система", "Чтобы открыть, байт", "Хранится всего, байт", "Всего на правку, байт", "Чистый текст, байт"],
        rows.map((r) => {
          const total = r.docSize.snapshotBytes + r.docSize.historyBytes;
          return [
            String(r.edits),
            NAMES[r.system as SystemId],
            String(r.docSize.snapshotBytes),
            String(total),
            fmt(total / r.edits),
            String(r.textBytes),
          ];
        }),
      ),
      "",
      `![Размер документа, удалений ${Math.round(ratio * 100)}%](charts/document-size-del${Math.round(ratio * 100)}.svg)`,
      "",
    );
  }

  lines.push("## 4. Доска дизайна: перемещение фигур", "");
  const boardRows: string[][] = [];
  const boardGroups = group(run.board, (r) => `${r.mode}|${r.clients}`);
  const boardKeys = [...boardGroups.keys()].sort((a, b) => {
    const [modeA, sizeA] = a.split("|");
    const [modeB, sizeB] = b.split("|");
    return modeA === modeB ? Number(sizeA) - Number(sizeB) : modeA!.localeCompare(modeB!);
  });
  for (const key of boardKeys) {
    for (const system of Object.keys(COLORS) as SystemId[]) {
      const runs = boardGroups.get(key)!.filter((r) => r.system === system);
      if (runs.length === 0) continue;
      boardRows.push([
        runs[0]!.mode === "ownShape" ? "каждый двигает свою" : "все двигают одну",
        String(runs[0]!.clients),
        NAMES[system],
        fmt(avg(runs, (r) => r.latencyMs.p50)),
        fmt(avg(runs, (r) => r.latencyMs.p95)),
        runs.every((r) => r.converged) ? "да" : "НЕТ",
      ]);
    }
  }
  lines.push(
    table(["Режим", "N", "Система", "p50, мс", "p95, мс", "Состояния совпали"], boardRows),
    "",
    "![Доска](charts/board-latency-p95.svg)",
    "",
  );

  return lines.join("\n");
}
