import { useEffect, useRef, useState } from "react";
import { ChevronUp, Download, GitBranch, Upload } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";

/** One "GitHub" button instead of two: bring a repository in, or send the changes back. */
export function GithubMenu({
  onImport,
  onPush,
  canPush,
}: {
  onImport: () => void;
  onPush: () => void;
  canPush: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={root} className="relative flex-1">
      <Button size="sm" className="w-full" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        <GitBranch size={14} />
        GitHub
        <ChevronUp size={13} className={cn("transition-transform", !open && "rotate-180")} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-60 rounded-xl bg-surface p-1.5 shadow-pop animate-pop"
        >
          <button
            role="menuitem"
            onClick={choose(onImport)}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-raised"
          >
            <Download size={16} className="mt-0.5 shrink-0 text-muted" />
            <span>
              Импортировать репозиторий
              <span className="block text-xs text-faint">Файлы по ссылке на публичный репозиторий</span>
            </span>
          </button>
          <button
            role="menuitem"
            onClick={choose(onPush)}
            disabled={!canPush}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-raised disabled:pointer-events-none disabled:opacity-40"
          >
            <Upload size={16} className="mt-0.5 shrink-0 text-muted" />
            <span>
              Отправить изменения в GitHub
              <span className="block text-xs text-faint">Коммит с вашими правками</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
