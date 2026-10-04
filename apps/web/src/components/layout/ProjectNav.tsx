import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { FileCode2, FileText, GitBranch, PenTool, Plus, UserPlus, type LucideIcon } from "lucide-react";
import type { FileRecord, FileType, Project, ProjectWithMembers } from "@collab/shared";
import { api } from "../../lib/api";
import { gradientFor, initials } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { useOnlineUsers, useRealtimeStatus } from "../../lib/RealtimeContext";
import { Button, IconButton } from "../ui/Button";
import { LogoMark } from "../ui/Logo";
import { RoleBadge } from "../ui/RoleBadge";
import { UserMenu } from "./UserMenu";

export const FILE_KINDS: Record<FileType, { label: string; plural: string; icon: LucideIcon; tone: string }> = {
  code: { label: "Код", plural: "Код", icon: FileCode2, tone: "text-[#60a5fa]" },
  doc: { label: "Документ", plural: "Документы", icon: FileText, tone: "text-[#34d399]" },
  board: { label: "Доска", plural: "Доски", icon: PenTool, tone: "text-[#f472b6]" },
};

function splitPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? { dir: "", name: path } : { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}

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
  onNavigate,
}: {
  project: ProjectWithMembers;
  files: FileRecord[];
  canEdit: boolean;
  onCreateFile: (type: FileType) => void;
  onCreateProject: () => void;
  onInvite: () => void;
  onImport: () => void;
  onNavigate: () => void;
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
            <RoleBadge role={project.myRole} className="mt-0.5" />
          </div>
          <IconButton label="Пригласить участников" onClick={onInvite}>
            <UserPlus size={17} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {(Object.keys(FILE_KINDS) as FileType[]).map((type) => {
            const kind = FILE_KINDS[type];
            const items = files.filter((file) => file.type === type);
            if (items.length === 0 && !canEdit) return null;
            return (
              <section key={type}>
                <div className="group mb-1 flex items-center justify-between px-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint">{kind.plural}</h2>
                  {canEdit && (
                    <button
                      onClick={() => onCreateFile(type)}
                      aria-label={`Создать: ${kind.label.toLowerCase()}`}
                      title={`Создать: ${kind.label.toLowerCase()}`}
                      className="rounded p-0.5 text-faint transition hover:bg-raised hover:text-fg"
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {items.map((file) => {
                    const { dir, name } = splitPath(file.path);
                    return (
                      <li key={file.id}>
                        <NavLink
                          to={`/projects/${project.id}/files/${file.id}`}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition",
                              isActive ? "bg-accent/15 text-fg" : "text-muted hover:bg-raised hover:text-fg",
                            )
                          }
                        >
                          <kind.icon size={16} className={cn("shrink-0", kind.tone)} />
                          <span className="truncate">
                            {dir && <span className="text-faint">{dir}</span>}
                            {name}
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                  {items.length === 0 && <li className="px-2.5 py-1 text-xs text-faint">Пока ничего нет</li>}
                </ul>
              </section>
            );
          })}
          {files.length === 0 && !canEdit && <p className="px-2.5 text-sm text-faint">В проекте пока нет файлов.</p>}
        </div>

        <div className="space-y-2 border-t border-line p-3">
          {canEdit && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => onCreateFile("code")}>
                <Plus size={14} />
                Файл
              </Button>
              <Button size="sm" className="flex-1" onClick={onImport} title="Импортировать репозиторий GitHub">
                <GitBranch size={14} />
                GitHub
              </Button>
            </div>
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
