import { useEffect, useRef, useState } from "react";
import { ChevronUp, Copy, Check, Maximize2, Minimize2, SquareTerminal, Info } from "lucide-react";
import type { RunState } from "../lib/RealtimeContext";
import { missingModule } from "../lib/run-hints";
import { cn } from "../lib/cn";
import { IconButton } from "./ui/Button";

const STATUS: Record<RunState["status"], { label: string; dot: string }> = {
  running: { label: "выполняется…", dot: "bg-warn animate-pulse" },
  ok: { label: "завершено", dot: "bg-ok" },
  error: { label: "ошибка", dot: "bg-bad" },
  timeout: { label: "превышено время (10 с)", dot: "bg-bad" },
  failed: { label: "не удалось запустить", dot: "bg-bad" },
};

export function RunPanel({ run }: { run: RunState | undefined }) {
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (run?.status === "running") setOpen(true);
  }, [run?.runId, run?.status]);

  // While the program runs, follow the newest output. When it has failed, show the beginning:
  // the actual error message comes first and the stack trace below it is the less useful part.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (run?.status === "running" || run?.status === "ok") el.scrollTop = el.scrollHeight;
    else if (run) el.scrollTop = 0;
  }, [run?.output.length, run?.status, open]);

  const text = run?.output.map((part) => part.chunk).join("") ?? "";
  const missing = run && run.status !== "running" && run.status !== "ok" ? missingModule(text) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; the output stays selectable
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      <div className="flex h-9 items-center gap-1 pr-2">
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center justify-between gap-3 px-4 text-left text-xs text-muted transition hover:bg-raised/60"
        >
          <span className="flex items-center gap-2 font-semibold uppercase tracking-wider text-faint">
            <SquareTerminal size={14} />
            Вывод
            <ChevronUp size={14} className={cn("transition-transform", !open && "rotate-180")} />
          </span>
          {run && (
            <span className="flex min-w-0 items-center gap-2 truncate">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS[run.status].dot)} />
              {run.startedBy.name} · {STATUS[run.status].label}
              {run.durationMs !== null && ` · ${(run.durationMs / 1000).toFixed(1)} с`}
            </span>
          )}
        </button>
        {open && text && (
          <IconButton label={copied ? "Скопировано" : "Копировать вывод"} onClick={copy} className="h-7 w-7">
            {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
          </IconButton>
        )}
        {open && (
          <IconButton
            label={tall ? "Уменьшить панель" : "Увеличить панель"}
            onClick={() => setTall((value) => !value)}
            className="h-7 w-7"
          >
            {tall ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </IconButton>
        )}
      </div>

      {open && (
        <>
          {missing && (
            <p className="flex items-start gap-2 border-t border-line bg-warn/10 px-4 py-2 text-xs text-warn">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                Модуль «{missing}» не найден. В песочнице нет сети и установленных пакетов: доступны встроенные модули
                языка и файлы вашего проекта.
              </span>
            </p>
          )}
          <pre
            ref={bodyRef}
            className={cn(
              "overflow-auto whitespace-pre-wrap break-words border-t border-line bg-canvas px-4 py-3 font-mono text-xs leading-5 text-fg/90",
              tall ? "h-[55vh]" : "h-48",
            )}
          >
            {!run && <span className="text-faint">Здесь появится результат запуска — его увидят все участники.</span>}
            {run?.output.map((part, index) => (
              <span key={index} className={part.stream === "stderr" ? "text-bad" : undefined}>
                {part.chunk}
              </span>
            ))}
            {run?.status === "running" && run.output.length === 0 && <span className="text-faint">…</span>}
            {run?.truncated && <span className="text-warn">{"\n[вывод обрезан]"}</span>}
            {run && run.status !== "running" && run.exitCode !== null && run.exitCode !== 0 && (
              <span className="text-faint">{`\n[код выхода ${run.exitCode}]`}</span>
            )}
          </pre>
        </>
      )}
    </div>
  );
}
