import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { GitBranch, Plus, Search, SquareTerminal, UserPlus } from "lucide-react";
import type { FileRecord, FileType, Project, ProjectWithMembers } from "@collab/shared";
import { api } from "../../lib/api";
import { gradientFor, initials } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { useOnlineUsers, useRealtimeStatus } from "../../lib/RealtimeContext";
import { Button, IconButton } from "../ui/Button";
import { LogoMark } from "../ui/Logo";
import { RoleBadge } from "../ui/RoleBadge";
import { FileTree } from "./FileTree";
import { GithubMenu } from "./GithubMenu";
import { TrashSection } from "./TrashSection";
import { UserMenu } from "./UserMenu";

export { FILE_KINDS } from "./file-kinds";

function ProjectRail({ activeId, onCreateProject }: { activeId: string; onCreateProject: () => void }) {
  const navigate = useNavigate();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });

  return (
    <nav aria-label="Проекты" className="flex w-[68px] shrink-0 flex-col items-center gap-3 border-r border-line bg-canvas py-3">
      <Link to="/" title="Все проекты" className="rounded-xl transition hover:scale-105">
        <LogoMark size={42} />
      </Link>
      <span className="h-px w-8 bg-line" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overflow-x-hidden py-0.5">
        {projects?.map((project) => {
          const active = project.id === activeId;
          return (
            <button
              key={project.id}
              title={project.name}
              aria-label={project.name}
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group relative flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <span
                className={cn(
                  "absolute -left-3.5 w-1 rounded-r-full bg-fg transition-all",
                  active ? "h-8" : "h-0 group-hover:h-4",
                )}
              />
              <span
                style={{ background: gradientFor(project.id) }}
                className={cn(
                  "flex h-11 w-11 items-center justify-center text-sm font-bold text-black/70 transition-all duration-200",
                  active ? "rounded-[14px]" : "rounded-full group-hover:rounded-[14px]",
                )}
              >
                {initials(project.name)}
              </span>
            </button>
          );
        })}
        <button
          onClick={onCreateProject}
          title="Новый проект"
          aria-label="Новый проект"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted transition-all hover:rounded-[14px] hover:border-accent hover:text-accent"
        >
          <Plus size={20} />
        </button>
      </div>
      <UserMenu placement="above-right" />
    </nav>
  );
}

export function ProjectNav({
  project,
  files,
  canEdit,
  onCreateFile,
  onCreateProject,
  onInvite,
  onImport,
  onPush,
  onDeleteFile,
  onRenameFile,
  onSearch,
  onNavigate,
  onBranches,
  terminalOpen,
  onToggleTerminal,
}: {
  project: ProjectWithMembers;
  files: FileRecord[];
  canEdit: boolean;
  onCreateFile: (type: FileType) => void;
  onCreateProject: () => void;
  onInvite: () => void;
  onImport: () => void;
  onPush: () => void;
  onDeleteFile: (file: FileRecord) => void;
  onRenameFile: (file: FileRecord) => void;
  onSearch: () => void;
  onNavigate: () => void;
  onBranches: () => void;
  /** Undefined when this server has no terminal. */
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
}) {
  const online = useOnlineUsers();
  const status = useRealtimeStatus();

  return (
    <div className="flex h-full">
      <ProjectRail activeId={project.id} onCreateProject={onCreateProject} />
      <aside className="flex w-60 flex-col bg-surface">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{project.name}</h1>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <RoleBadge role={project.myRole} />
              {project.github && (
                <button
                  onClick={onBranches}
                  title={`${project.github.owner}/${project.github.repo}: сменить ветку`}
                  aria-label="Ветка репозитория"
                  className="flex min-w-0 items-center gap-1 rounded-md border border-line px-1.5 py-px text-[11px] text-muted transition hover:border-accent hover:text-fg"
                >
                  <GitBranch size={11} className="shrink-0" />
                  <span className="truncate font-mono">{project.github.branch ?? "ветка"}</span>
                </button>
              )}
            </div>
          </div>
          <IconButton label="Пригласить участников" onClick={onInvite}>
            <UserPlus size={17} />
          </IconButton>
        </div>

        {files.length > 0 && (
          <div className="px-3 pt-3">
            <button
              onClick={onSearch}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-left text-xs text-faint transition hover:border-faint hover:text-muted"
            >
              <Search size={14} />
              <span className="flex-1">Найти файл</span>
              <kbd className="rounded border border-line px-1 text-[10px]">Ctrl P</kbd>
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-1 flex items-center justify-between px-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint">Файлы</h2>
            {canEdit && (
              <button
                onClick={() => onCreateFile("code")}
                aria-label="Создать файл"
                title="Создать файл"
                className="rounded p-0.5 text-faint transition hover:bg-raised hover:text-fg"
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          <FileTree
            projectId={project.id}
            files={files}
            canEdit={canEdit}
            onNavigate={onNavigate}
            onDeleteFile={onDeleteFile}
            onRenameFile={onRenameFile}
          />
          <TrashSection projectId={project.id} canEdit={canEdit} isOwner={project.myRole === "owner"} />
        </div>

        <div className="space-y-2 border-t border-line p-3">
          {canEdit && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => onCreateFile("code")}>
                <Plus size={14} />
                Файл
              </Button>
              <GithubMenu onImport={onImport} onPush={onPush} canPush={files.length > 0} />
            </div>
          )}
          {canEdit && onToggleTerminal && (
            <button
              onClick={onToggleTerminal}
              aria-pressed={terminalOpen}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs transition",
                terminalOpen ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg",
              )}
            >
              <SquareTerminal size={14} className="text-ok" />
              <span className="flex-1 text-left">Терминал</span>
              <kbd className="rounded border border-line px-1 text-[10px] text-faint">Ctrl `</kbd>
            </button>
          )}
          <p className="flex items-center gap-2 px-1 text-xs text-muted">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                status === "open" ? "bg-ok animate-pulse-ring" : status === "connecting" ? "bg-warn" : "bg-faint",
              )}
            />
            {status === "open"
              ? `${online.length} в сети`
              : status === "connecting"
                ? "Подключение…"
                : "Нет связи"}
          </p>
        </div>
      </aside>
    </div>
  );
}
