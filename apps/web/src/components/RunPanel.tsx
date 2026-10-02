import { useEffect, useRef, useState } from "react";
import { ChevronUp, SquareTerminal } from "lucide-react";
import type { RunState } from "../lib/RealtimeContext";
import { cn } from "../lib/cn";

const STATUS: Record<RunState["status"], { label: string; dot: string }> = {
  running: { label: "выполняется…", dot: "bg-warn animate-pulse" },
  ok: { label: "завершено", dot: "bg-ok" },
  error: { label: "ошибка", dot: "bg-bad" },
  timeout: { label: "превышено время (10 с)", dot: "bg-bad" },
  failed: { label: "не удалось запустить", dot: "bg-bad" },
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
    <div className="shrink-0 border-t border-line bg-surface">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between gap-3 px-4 text-left text-xs text-muted transition hover:bg-raised/60"
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

      {open && (
        <pre
          ref={bodyRef}
          className="h-48 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-canvas px-4 py-3 font-mono text-xs leading-5 text-fg/90"
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
      )}
    </div>
  );
}
