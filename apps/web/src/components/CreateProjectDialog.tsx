import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (value: string) => api.post<Project>("/projects", { name: value }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated(project);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  return (
    <Modal title="Новый проект" description="Это общее пространство: файлы, чат и участники в одном месте." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {create.error && (
          <ErrorNote>{create.error instanceof ApiError ? create.error.message : "Не удалось создать проект"}</ErrorNote>
        )}
        <Field
          label="Название"
          placeholder="Например, Курсовая по алгоритмам"
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
