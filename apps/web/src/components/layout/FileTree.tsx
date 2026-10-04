import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, Folder, FolderOpen, Trash2 } from "lucide-react";
import type { FileRecord } from "@collab/shared";
import { ancestorDirs, buildFileTree, type TreeNode } from "../../lib/file-tree";
import { cn } from "../../lib/cn";
import { FILE_KINDS } from "./file-kinds";

const INDENT_PX = 14;

export function FileTree({
  projectId,
  files,
  canEdit,
  onNavigate,
  onDeleteFile,
}: {
  projectId: string;
  files: FileRecord[];
  canEdit: boolean;
  onNavigate: () => void;
  onDeleteFile: (file: FileRecord) => void;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Opening a file (or following a link to one) unfolds the folders it sits in.
  const activeFile = files.find((file) => location.pathname.endsWith(`/files/${file.id}`));
  useEffect(() => {
    if (!activeFile) return;
    const parents = ancestorDirs(activeFile.path);
    setCollapsed((previous) => (parents.some((dir) => previous.has(dir)) ? new Set([...previous].filter((dir) => !parents.includes(dir))) : previous));
  }, [activeFile]);

  function toggle(path: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  function renderNodes(nodes: TreeNode[], depth: number) {
    return nodes.map((node) => {
      const pad = { paddingLeft: 10 + depth * INDENT_PX };

      if (node.kind === "dir") {
        const open = !collapsed.has(node.path);
        const Icon = open ? FolderOpen : Folder;
        return (
          <li key={`dir:${node.path}`}>
            <button
              onClick={() => toggle(node.path)}
              aria-expanded={open}
              style={pad}
              className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm text-muted transition hover:bg-raised hover:text-fg"
            >
              <ChevronRight size={14} className={cn("shrink-0 text-faint transition-transform", open && "rotate-90")} />
              <Icon size={16} className="shrink-0 text-warn/80" />
              <span className="truncate">{node.name}</span>
            </button>
            {open && <ul className="space-y-0.5">{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }

      const kind = FILE_KINDS[node.file.type];
      return (
        <li key={node.file.id} className="group/file relative">
          <NavLink
            to={`/projects/${projectId}/files/${node.file.id}`}
            onClick={onNavigate}
            title={node.file.path}
            style={{ paddingLeft: 10 + depth * INDENT_PX + 20 }}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg py-1.5 pr-8 text-sm transition",
                isActive ? "bg-accent/15 text-fg" : "text-muted hover:bg-raised hover:text-fg",
              )
            }
          >
            <kind.icon size={16} className={cn("shrink-0", kind.tone)} />
            <span className="truncate">{node.name}</span>
          </NavLink>
          {canEdit && (
            <button
              onClick={() => onDeleteFile(node.file)}
              aria-label={`Удалить ${node.file.path}`}
              title="Удалить файл"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint opacity-0 transition hover:bg-bad/15 hover:text-bad focus-visible:opacity-100 group-hover/file:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          )}
        </li>
      );
    });
  }

  if (files.length === 0) {
    return <p className="px-3 py-2 text-sm text-faint">{canEdit ? "Файлов пока нет." : "В проекте пока нет файлов."}</p>;
  }
  return <ul className="space-y-0.5">{renderNodes(tree, 0)}</ul>;
}
