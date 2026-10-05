import { useEffect, useRef, useState } from "react";
import { ChevronRight, TextSearch, X } from "lucide-react";
import { SEARCH_LIMITS, type FileRecord, type SearchMatch, type SearchResult } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { FILE_KINDS, fileTone } from "./layout/file-kinds";
import { IconButton } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

const SEARCH_DELAY_MS = 300;

type Lookup =
  | { state: "idle" }
  | { state: "loading"; previous?: SearchResult }
  | { state: "ready"; data: SearchResult }
  | { state: "error"; message: string };

const LEAD_CHARS = 24;

function Preview({ match }: { match: SearchMatch }) {
  const end = match.previewOffset + match.length;
  // The panel is narrow: keep only a little text before the match so the match itself stays visible.
  const start = match.previewOffset > LEAD_CHARS ? match.previewOffset - LEAD_CHARS + 1 : 0;
  return (
    <span className="truncate font-mono text-[12px]">
      {start > 0 && "…"}
      {match.preview.slice(start, match.previewOffset)}
      <mark className="rounded-sm bg-accent/25 text-fg">{match.preview.slice(match.previewOffset, end)}</mark>
      {match.preview.slice(end)}
    </span>
  );
}

/** "Find in project" (Ctrl+Shift+F): searches inside the files of the active branch on the server. */
export function SearchPanel({
  projectId,
  files,
  focusSignal,
  onOpen,
  onClose,
}: {
  projectId: string;
  files: FileRecord[];
  /** Changes whenever the shortcut is pressed again, to put the cursor back into the field. */
  focusSignal: number;
  onOpen: (fileId: string, match: SearchMatch) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const lookupId = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  // Ask the server only after a pause in typing. Results are not cached: they would go into the
  // persisted query cache and be stale after the next edit anyway.
  const term = query.trim();
  useEffect(() => {
    if (term.length < SEARCH_LIMITS.minQuery) {
      setLookup({ state: "idle" });
      return;
    }
    const id = ++lookupId.current;
    setLookup((current) => ({ state: "loading", previous: current.state === "ready" ? current.data : undefined }));
    const timer = setTimeout(() => {
      api
        .get<SearchResult>(`/projects/${projectId}/search?q=${encodeURIComponent(term)}`)
        .then((data) => {
          if (id !== lookupId.current) return;
          setLookup({ state: "ready", data });
          setCollapsed(new Set());
        })
        .catch((error) => {
          if (id !== lookupId.current) return;
          setLookup({ state: "error", message: error instanceof ApiError ? error.message : "Не удалось выполнить поиск" });
        });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term, projectId]);

  const result = lookup.state === "ready" ? lookup.data : lookup.state === "loading" ? lookup.previous : undefined;
  const total = result?.files.reduce((sum, file) => sum + file.matches.length, 0) ?? 0;
  const types = new Map(files.map((file) => [file.id, file.type]));

  const toggle = (fileId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(fileId)) next.add(fileId);
      return next;
    });

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TextSearch size={16} className="text-accent" />
          Поиск по проекту
        </h2>
        <IconButton label="Закрыть поиск" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="border-b border-line p-3">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onClose()}
          placeholder="Текст в файлах"
          aria-label="Текст для поиска"
          maxLength={SEARCH_LIMITS.maxQuery}
          className="h-9 w-full rounded-lg border border-line bg-canvas px-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mt-2 flex min-h-4 items-center gap-2 text-xs text-faint">
          {lookup.state === "loading" && <Spinner size={12} />}
          {result && total > 0 && (
            <span>
              Совпадений — {total}, файлов — {result.files.length}
              {result.truncated && ". Показаны не все: уточните запрос"}
            </span>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {lookup.state === "idle" && (
          <p className="px-2 py-6 text-center text-sm text-faint">
            Введите хотя бы {SEARCH_LIMITS.minQuery} символа — найдём их во всех файлах текущей ветки.
          </p>
        )}
        {lookup.state === "loading" && !result && <p className="px-2 py-6 text-center text-sm text-faint">Ищем…</p>}
        {lookup.state === "error" && <p className="px-2 py-6 text-center text-sm text-bad">{lookup.message}</p>}
        {result && total === 0 && lookup.state === "ready" && (
          <p className="px-2 py-6 text-center text-sm text-faint">Ничего не найдено</p>
        )}

        {result?.files.map((file) => {
          const type = types.get(file.fileId) ?? "code";
          const Icon = FILE_KINDS[type].icon;
          const open = !collapsed.has(file.fileId);
          const slash = file.path.lastIndexOf("/");
          return (
            <section key={file.fileId} className="mb-1">
              <button
                onClick={() => toggle(file.fileId)}
                aria-expanded={open}
                title={file.path}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition hover:bg-raised"
              >
                <ChevronRight size={13} className={cn("shrink-0 text-faint transition-transform", open && "rotate-90")} />
                <Icon size={14} className={cn("shrink-0", fileTone(file.path, type))} />
                <span className="truncate">{file.path.slice(slash + 1)}</span>
                {slash !== -1 && <span className="truncate text-xs text-faint">{file.path.slice(0, slash)}</span>}
                <span className="ml-auto shrink-0 rounded-full bg-raised px-1.5 text-[10px] text-muted">{file.matches.length}</span>
              </button>
              {open && (
                <ul>
                  {file.matches.map((match) => (
                    <li key={`${match.line}:${match.column}`}>
                      <button
                        onClick={() => onOpen(file.fileId, match)}
                        title={`Строка ${match.line}`}
                        className="flex w-full items-baseline gap-2 rounded-md py-0.5 pl-7 pr-1.5 text-left text-muted transition hover:bg-raised hover:text-fg"
                      >
                        <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-faint">{match.line}</span>
                        <Preview match={match} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
