import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote } from "./ui/Field";
import { Modal } from "./ui/Modal";

/** A yes/no question that runs `action` on confirmation and shows its error, if any. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel = "Подождите…",
  danger,
  action,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  danger?: boolean;
  action: () => Promise<unknown>;
  onClose: () => void;
  onDone?: () => void;
}) {
  const run = useMutation({
    mutationFn: action,
    onSuccess: () => {
      onDone?.();
      onClose();
    },
  });

  return (
    <Modal title={title} description={description} onClose={onClose}>
      <div className="space-y-4">
        {run.error && (
          <ErrorNote>{run.error instanceof ApiError ? run.error.message : "Не удалось выполнить действие"}</ErrorNote>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={run.isPending}>
            Отмена
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
