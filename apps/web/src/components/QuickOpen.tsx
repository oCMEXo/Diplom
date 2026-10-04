import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import type { FileRecord } from "@collab/shared";
import { fuzzyFilter } from "../lib/fuzzy";
import { cn } from "../lib/cn";
import { FILE_KINDS, fileTone } from "./layout/file-kinds";

const MAX_RESULTS = 12;

/** "Go to file": type a few letters of a name, move with the arrows, open with Enter. */
export function QuickOpen({
  files,
  onOpen,
  onClose,
}: {
  files: FileRecord[];
  onOpen: (file: FileRecord) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => fuzzyFilter(files, query).slice(0, MAX_RESULTS), [files, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const file = results[active];
      if (file) onOpen(file);
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[15vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Найти файл"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-pop animate-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Начните вводить имя файла"
            aria-label="Имя файла"
            className="h-12 w-full bg-transparent text-sm placeholder:text-faint focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.map((file, index) => {
            const kind = FILE_KINDS[file.type];
            const slash = file.path.lastIndexOf("/");
            return (
              <li key={file.id} role="option" aria-selected={index === active}>
                <button
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onOpen(file)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                    index === active ? "bg-accent/15 text-fg" : "text-muted",
                  )}
                >
                  <kind.icon size={16} className={cn("shrink-0", fileTone(file.path, file.type))} />
                  <span className="truncate">{file.path.slice(slash + 1)}</span>
                  {slash !== -1 && <span className="truncate text-xs text-faint">{file.path.slice(0, slash)}</span>}
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">Ничего не найдено</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
