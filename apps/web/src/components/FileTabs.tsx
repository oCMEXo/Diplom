import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import type { FileRecord } from "@collab/shared";
import { cn } from "../lib/cn";
import { useOpenTabs } from "../lib/tabs";
import { FILE_KINDS, fileTone } from "./layout/file-kinds";

/** Tabs of the files a person has opened in this project; the active one is the file on screen. */
export function FileTabs({ projectId, files, activeId }: { projectId: string; files: FileRecord[]; activeId: string }) {
  const navigate = useNavigate();
  const { tabs, close } = useOpenTabs(
    projectId,
    files.map((file) => file.id),
    activeId,
  );
  const activeRef = useRef<HTMLAnchorElement>(null);
  const byId = new Map(files.map((file) => [file.id, file]));
  const open = tabs.map((id) => byId.get(id)).filter((file): file is FileRecord => !!file);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, open.length]);

  // With a single tab there is nothing to switch between.
  if (open.length < 2) return null;

  function closeTab(id: string) {
    const next = close(id);
    if (id !== activeId) return;
    navigate(next ? `/projects/${projectId}/files/${next}` : `/projects/${projectId}`);
  }

  return (
    <div role="tablist" aria-label="Открытые файлы" className="flex shrink-0 overflow-x-auto border-b border-line bg-surface">
      {open.map((file) => {
        const kind = FILE_KINDS[file.type];
        const active = file.id === activeId;
        return (
          <div
            key={file.id}
            className={cn(
              "group/tab relative flex shrink-0 items-center border-r border-line text-sm transition",
              active ? "bg-canvas text-fg" : "text-muted hover:bg-raised hover:text-fg",
            )}
          >
            {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
            <Link
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              to={`/projects/${projectId}/files/${file.id}`}
              title={file.path}
              className="flex items-center gap-2 py-2 pl-3 pr-1.5"
            >
              <kind.icon size={14} className={cn("shrink-0", fileTone(file.path, file.type))} />
              <span className="max-w-40 truncate">{file.path.split("/").pop()}</span>
            </Link>
            <button
              onClick={() => closeTab(file.id)}
              aria-label={`Закрыть вкладку ${file.path}`}
              title="Закрыть вкладку"
              className="mr-1.5 rounded p-0.5 text-faint opacity-0 transition hover:bg-raised hover:text-fg focus-visible:opacity-100 group-hover/tab:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
