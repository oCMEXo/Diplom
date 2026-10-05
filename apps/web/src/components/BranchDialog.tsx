import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, GitBranch, LoaderCircle, Search } from "lucide-react";
import type { BranchList, BranchSwitchResult, ProjectWithMembers } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { ErrorNote } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { Spinner } from "./ui/Spinner";

export function refreshProjectFiles(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  for (const key of ["project", "files", "trash", "branches"]) {
    void queryClient.invalidateQueries({ queryKey: [key, projectId] });
  }
}

/** Lists the repository's branches; picking one switches the whole project to it. */
export function BranchDialog({
  project,
  canEdit,
  onClose,
}: {
  project: ProjectWithMembers;
  canEdit: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

  const branches = useQuery({
    queryKey: ["branches", project.id],
    queryFn: () => api.get<BranchList>(`/projects/${project.id}/branches`),
    retry: false,
  });

  const switchTo = useMutation({
    mutationFn: (name: string) => api.post<BranchSwitchResult>(`/projects/${project.id}/branch`, { name }),
    onSuccess: () => {
      refreshProjectFiles(queryClient, project.id);
      navigate(`/projects/${project.id}`);
      onClose();
    },
  });

  const data = branches.data;
  const visible = data?.branches.filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  return (
    <Modal
      title="Ветки репозитория"
      description={
        data
          ? `${data.repo.owner}/${data.repo.name}. Каждая ветка хранит свои файлы и правки: можно переключаться туда и обратно.`
          : branches.isError
            ? "Список веток сейчас недоступен."
            : "Загружаем список веток…"
      }
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="space-y-3">
        {branches.isError && (
          <ErrorNote>{branches.error instanceof ApiError ? branches.error.message : "Не удалось получить ветки"}</ErrorNote>
        )}
        {switchTo.error && (
          <ErrorNote>{switchTo.error instanceof ApiError ? switchTo.error.message : "Не удалось открыть ветку"}</ErrorNote>
        )}
        {branches.isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {data && (
          <>
            {data.branches.length > 6 && (
              <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3">
                <Search size={14} className="text-faint" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Найти ветку"
                  aria-label="Найти ветку"
                  className="h-9 w-full bg-transparent text-sm placeholder:text-faint focus:outline-none"
                />
              </label>
            )}
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {visible.map((name) => {
                const active = name === data.active;
                const pending = switchTo.isPending && switchTo.variables === name;
                return (
                  <li key={name}>
                    <button
                      onClick={() => !active && canEdit && switchTo.mutate(name)}
                      disabled={active || !canEdit || switchTo.isPending}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                        active ? "bg-accent/15 text-fg" : "text-muted enabled:hover:bg-raised enabled:hover:text-fg",
                        !active && !canEdit && "cursor-default",
                      )}
                    >
                      <GitBranch size={15} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{name}</span>
                      {name === data.defaultBranch && <span className="text-[11px] text-faint">основная</span>}
                      {data.loaded.includes(name) && !active && (
                        <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">открывалась</span>
                      )}
                      {pending && <LoaderCircle size={15} className="animate-spin text-accent" />}
                      {active && <Check size={15} className="text-accent" />}
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-faint">Ничего не найдено</li>}
            </ul>
            <p className="text-xs text-faint">
              {canEdit
                ? "Ветка переключится у всех участников проекта. Ветку, которая ещё не открывалась, загрузим с GitHub."
                : "Переключать ветки могут редакторы и владелец проекта."}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
