import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FileRecord } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

/** Renames a file; a name with slashes ("src/app.js") also moves it into that folder. */
export function RenameFileDialog({
  projectId,
  file,
  files,
  onClose,
}: {
  projectId: string;
  file: FileRecord;
  files: FileRecord[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState(file.path);
  const trimmed = path.trim();
  const clash = trimmed !== file.path && files.some((other) => other.path === trimmed);
  const invalid = trimmed.startsWith("/") || trimmed.endsWith("/") || trimmed.includes("..");

  const rename = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}/files/${file.id}`, { path: trimmed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed && trimmed !== file.path && !clash && !invalid) rename.mutate();
  }

  return (
    <Modal title="Переименовать файл" description="Чтобы переместить файл в папку, укажите её в имени: src/app.js." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {rename.error && (
          <ErrorNote>{rename.error instanceof ApiError ? rename.error.message : "Не удалось переименовать файл"}</ErrorNote>
        )}
        <Field
          label="Новое имя"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          maxLength={500}
          hint={
            clash ? (
              <span className="text-bad">Файл с таким именем уже есть</span>
            ) : invalid ? (
              <span className="text-bad">Имя не должно начинаться или заканчиваться на «/» и содержать «..»</span>
            ) : undefined
          }
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={rename.isPending}>
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!trimmed || trimmed === file.path || clash || invalid || rename.isPending}
          >
            {rename.isPending ? "Сохраняем…" : "Переименовать"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
