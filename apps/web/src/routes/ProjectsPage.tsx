import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Project } from "@collab/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function ProjectsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/projects"),
  });

  const createProject = useMutation({
    mutationFn: (name: string) => api.post<Project>("/projects", { name }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) createProject.mutate(name.trim());
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Проекты</h1>
          <p className="text-sm text-slate-500">
            {user?.name}
            {user?.isGuest && (
              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                гость
              </span>
            )}
          </p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 underline">
          Выйти
        </button>
      </header>

      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название проекта"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={createProject.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Создать
        </button>
      </form>

      {isLoading && <p className="text-sm text-slate-500">Загрузка...</p>}

      <ul className="space-y-2">
        {projects?.map((project) => (
          <li key={project.id}>
            <Link
              to={`/projects/${project.id}`}
              className="flex items-center justify-between rounded border border-slate-200 px-4 py-3 text-sm hover:border-slate-400"
            >
              <span className="font-medium text-slate-900">{project.name}</span>
              <span className="text-xs uppercase text-slate-400">{project.myRole}</span>
            </Link>
          </li>
        ))}
        {projects?.length === 0 && (
          <p className="text-sm text-slate-500">Проектов пока нет — создайте первый выше.</p>
        )}
      </ul>
    </div>
  );
}
