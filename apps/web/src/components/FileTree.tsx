import { useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import type { FileRecord, FileType } from "@collab/shared";

const ICONS: Record<FileType, string> = { code: "⌨", doc: "📄", board: "🎨" };

export function FileTree({
  projectId,
  files,
  canEdit,
  onCreate,
}: {
  projectId: string;
  files: FileRecord[];
  canEdit: boolean;
  onCreate: (path: string, type: FileType) => void;
}) {
  const [path, setPath] = useState("");
  const [type, setType] = useState<FileType>("code");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;
    onCreate(path.trim(), type);
    setPath("");
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {files.map((file) => (
          <li key={file.id}>
            <NavLink
              to={`/projects/${projectId}/files/${file.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded px-2 py-1 text-sm ${
                  isActive ? "bg-slate-200 text-slate-900" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <span>{ICONS[file.type]}</span>
              <span className="truncate">{file.path}</span>
            </NavLink>
          </li>
        ))}
        {files.length === 0 && <li className="px-2 py-1 text-sm text-slate-400">Файлов нет</li>}
      </ul>

      {canEdit && (
        <form onSubmit={onSubmit} className="space-y-2 border-t border-slate-200 p-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="main.py"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
          />
          <div className="flex gap-1">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FileType)}
              className="rounded border border-slate-300 px-1 py-1 text-xs"
            >
              <option value="code">код</option>
              <option value="doc">документ</option>
              <option value="board">доска</option>
            </select>
            <button
              type="submit"
              className="flex-1 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              + файл
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
