import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function ChangeNameDialog({ onClose }: { onClose: () => void }) {
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateName(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить имя");
      setSaving(false);
    }
  }

  return (
    <Modal title="Как вас зовут?" description="Это имя видят другие участники: в чате, на курсоре и в списке." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-center gap-4">
          {user && <Avatar id={user.id} name={name || "?"} size="lg" />}
          <div className="flex-1">
            <Field label="Имя" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
