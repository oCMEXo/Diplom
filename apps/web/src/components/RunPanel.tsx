import { useEffect, useRef, useState } from "react";
import type { RunState } from "../lib/RealtimeContext";

const STATUS_LABEL: Record<RunState["status"], string> = {
  running: "выполняется…",
  ok: "завершено",
  error: "ошибка",
  timeout: "превышено время (10 с)",
  failed: "не удалось запустить",
};

export function RunPanel({ run }: { run: RunState | undefined }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (run?.status === "running") setOpen(true);
  }, [run?.runId, run?.status]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run?.output.length]);

  return (
    <div className="border-t border-slate-200 bg-white">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-1 text-left text-xs text-slate-500 hover:bg-slate-50"
      >
        <span className="font-semibold uppercase text-slate-400">
          Вывод {open ? "▾" : "▸"}
        </span>
        {run && (
          <span>
            {run.startedBy.name} · {STATUS_LABEL[run.status]}
            {run.durationMs !== null && ` · ${(run.durationMs / 1000).toFixed(1)} с`}
          </span>
        )}
      </button>

      {open && (
        <pre
          ref={bodyRef}
          className="h-44 overflow-auto whitespace-pre-wrap break-words bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
        >
          {!run && <span className="text-slate-500">Здесь появится результат запуска</span>}
          {run?.output.map((part, index) => (
            <span key={index} className={part.stream === "stderr" ? "text-red-300" : undefined}>
              {part.chunk}
            </span>
          ))}
          {run?.status === "running" && run.output.length === 0 && (
            <span className="text-slate-500">…</span>
          )}
          {run?.truncated && <span className="text-amber-300">{"\n[вывод обрезан]"}</span>}
          {run && run.status !== "running" && run.exitCode !== null && run.exitCode !== 0 && (
            <span className="text-slate-500">{`\n[код выхода ${run.exitCode}]`}</span>
          )}
        </pre>
      )}
    </div>
  );
}
