import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FileRecord } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function DeleteFileDialog({
  projectId,
  file,
  onClose,
  onDeleted,
}: {
  projectId: string;
  file: FileRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/files/${file.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      onDeleted();
    },
  });

  return (
    <Modal
      title="Удалить файл?"
      description={`«${file.path}» исчезнет у всех участников проекта. Восстановить его не получится.`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {remove.error && (
          <ErrorNote>{remove.error instanceof ApiError ? remove.error.message : "Не удалось удалить файл"}</ErrorNote>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Удаляем…" : "Удалить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
