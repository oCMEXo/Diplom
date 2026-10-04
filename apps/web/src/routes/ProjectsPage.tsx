import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LogOut, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import type { Project } from "@collab/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { gradientFor, initials } from "../lib/colors";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { RemoveProjectDialog } from "../components/RemoveProjectDialog";
import { UserMenu } from "../components/layout/UserMenu";
import { Button } from "../components/ui/Button";
import { Wordmark } from "../components/ui/Logo";
import { RoleBadge } from "../components/ui/RoleBadge";
import { Spinner } from "../components/ui/Spinner";

function projectCode(value: string) {
  // Accepts a full invite link or just the code.
  const match = value.trim().match(/\/join\/([^/?#\s]+)/);
  return match?.[1] ?? value.trim();
}

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState("");
  const [removing, setRemoving] = useState<Project | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/projects"),
  });

  function join(event: FormEvent) {
    event.preventDefault();
    const code = projectCode(link);
    if (code) navigate(`/join/${code}`);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Wordmark />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <section className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Привет, {user?.name}</h1>
            <p className="mt-2 max-w-lg text-sm text-muted">
              Проект — это постоянное общее пространство. Создайте своё или присоединитесь по ссылке-приглашению.
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Новый проект
          </Button>
        </section>

        <form onSubmit={join} className="mb-10 flex gap-2 rounded-2xl bg-surface p-2 shadow-card">
          <span className="flex items-center pl-3 text-faint">
            <LinkIcon size={18} />
          </span>
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Вставьте ссылку-приглашение, чтобы присоединиться"
            aria-label="Ссылка-приглашение"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm placeholder:text-faint focus:outline-none"
          />
          <Button type="submit" disabled={!link.trim()}>
            Присоединиться
            <ArrowRight size={15} />
          </Button>
        </form>

        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Ваши проекты</h2>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {projects && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id} className="group/card relative">
                <Link
                  to={`/projects/${project.id}`}
                  className="group flex h-full flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <span
                    style={{ background: gradientFor(project.id) }}
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-black/70"
                  >
                    {initials(project.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{project.name}</p>
                    <p className="mt-1 text-xs text-faint">
                      создан {new Date(project.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <RoleBadge role={project.myRole} />
                    <ArrowRight size={16} className="text-faint transition group-hover:translate-x-1 group-hover:text-accent" />
                  </div>
                </Link>
                <button
                  onClick={() => setRemoving(project)}
                  aria-label={project.myRole === "owner" ? `Удалить проект ${project.name}` : `Покинуть проект ${project.name}`}
                  title={project.myRole === "owner" ? "Удалить проект" : "Покинуть проект"}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-faint opacity-0 transition hover:bg-bad/15 hover:text-bad focus-visible:opacity-100 group-hover/card:opacity-100"
                >
                  {project.myRole === "owner" ? <Trash2 size={16} /> : <LogOut size={16} />}
                </button>
              </li>
            ))}
            <li>
              <button
                onClick={() => setCreating(true)}
                className="flex h-full min-h-[11rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted transition hover:border-accent hover:text-accent"
              >
                <Plus size={22} />
                Создать проект
              </button>
            </li>
          </ul>
        )}

        {projects?.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted">
            Пока пусто — создайте первый проект или откройте ссылку, которую вам прислали.
          </p>
        )}
      </main>

      {removing && <RemoveProjectDialog project={removing} onClose={() => setRemoving(null)} />}
      {creating && (
        <CreateProjectDialog onClose={() => setCreating(false)} onCreated={(project) => navigate(`/projects/${project.id}`)} />
      )}
    </div>
  );
}
