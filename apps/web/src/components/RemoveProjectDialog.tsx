import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/Button";
import { ErrorNote } from "./ui/Field";
import { Modal } from "./ui/Modal";

/** The owner deletes a project for everyone; anyone else just leaves it, which drops it from their list. */
export function RemoveProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = project.myRole === "owner";

  const remove = useMutation({
    mutationFn: () =>
      isOwner ? api.delete(`/projects/${project.id}`) : api.delete(`/projects/${project.id}/members/${user?.id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["project", project.id] });
      queryClient.removeQueries({ queryKey: ["files", project.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  return (
    <Modal
      title={isOwner ? "Удалить проект?" : "Покинуть проект?"}
      description={
        isOwner
          ? `«${project.name}» будет удалён у всех участников вместе с файлами и перепиской. Это нельзя отменить.`
          : `«${project.name}» исчезнет из вашего списка. Вернуться можно по ссылке-приглашению. Сам проект и файлы останутся у остальных.`
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        {remove.error && (
          <ErrorNote>{remove.error instanceof ApiError ? remove.error.message : "Не удалось выполнить действие"}</ErrorNote>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Подождите…" : isOwner ? "Удалить навсегда" : "Покинуть"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
