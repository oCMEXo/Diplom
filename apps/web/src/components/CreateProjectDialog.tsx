import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, GitBranch } from "lucide-react";
import type { ImportResult, Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";

type Source = "empty" | "github";

/** "https://github.com/owner/repo/tree/dev" -> "repo"; falls back to the raw text. */
export function projectNameFromRepoUrl(url: string) {
  const path = url.trim().replace(/[?#].*$/, "").replace(/^git@github\.com:/i, "").replace(/^https?:\/\//i, "");
  const segments = path.split("/").filter(Boolean);
  if (/^(www\.)?github\.com$/i.test(segments[0] ?? "")) segments.shift();
  return (segments[1] ?? segments[0] ?? "Импортированный проект").replace(/\.git$/i, "");
}

export function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<Source>("empty");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Project | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (source === "empty") return api.post<Project>("/projects", { name: name.trim() });
      const project = created ?? (await api.post<Project>("/projects", { name: projectNameFromRepoUrl(url) }));
      setCreated(project);
      await api.post<ImportResult>(`/projects/${project.id}/import/github`, { url: url.trim() });
      return project;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated(project);
    },
  });

  const ready = source === "empty" ? name.trim() : url.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !create.isPending) create.mutate();
  }

  return (
    <Modal title="Новый проект" description="Это общее пространство: файлы, чат и участники в одном месте." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          label="Откуда начать"
          value={source}
          onChange={setSource}
          options={[
            { value: "empty", label: "Пустой проект", icon: <FolderPlus size={20} /> },
            { value: "github", label: "Из GitHub", icon: <GitBranch size={20} /> },
          ]}
        />
        {create.error && (
          <ErrorNote>
            {create.error instanceof ApiError ? create.error.message : "Не удалось создать проект"}
            {created && " Проект уже создан — можно открыть его и повторить импорт."}
          </ErrorNote>
        )}
        {source === "empty" ? (
          // Different keys make React create a new field on switching, so autoFocus moves the cursor there.
          <Field
            key="name"
            autoFocus
            data-autofocus
            label="Название"
            placeholder="Например, Курсовая по алгоритмам"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : (
          <Field
            key="url"
            autoFocus
            data-autofocus
            label="Ссылка на репозиторий"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={create.isPending}
            hint="Публичный репозиторий: проект получит его название, а текстовые файлы окажутся внутри."
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          {created && create.error ? (
            <Button onClick={() => onCreated(created)}>Открыть проект</Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
              Отмена
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!ready || create.isPending}>
            {create.isPending ? (source === "github" ? "Загружаем…" : "Создаём…") : source === "github" ? "Создать и импортировать" : "Создать"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
