import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Eye, Pencil, RefreshCw } from "lucide-react";
import type { InviteLink, InviteRole, ProjectWithMembers } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";

export function InviteDialog({ project, onClose }: { project: ProjectWithMembers; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isOwner = project.myRole === "owner";
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailRole, setEmailRole] = useState<InviteRole>("editor");
  const link = `${window.location.origin}/join/${project.inviteCode}`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });

  const regenerate = useMutation({
    mutationFn: () => api.post<InviteLink>(`/projects/${project.id}/invite/regenerate`),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (role: InviteRole) => api.patch<InviteLink>(`/projects/${project.id}/invite`, { role }),
    onSuccess: refresh,
  });
  const inviteByEmail = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/members`, { email, role: emailRole }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // the field is selectable, so the link can still be copied by hand
    }
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) inviteByEmail.mutate();
  }

  return (
    <Modal
      title="Пригласить в проект"
      description="Любой, у кого есть ссылка, попадёт в проект — даже без регистрации, гостем."
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              aria-label="Ссылка-приглашение"
              onClick={(event) => event.currentTarget.select()}
              className="field font-mono text-xs"
            />
            <Button variant="primary" onClick={copyLink} className="w-36 shrink-0">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Скопировано" : "Копировать"}
            </Button>
          </div>

          {isOwner ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">Что смогут делать пришедшие по ссылке:</p>
              <Segmented
                label="Роль по ссылке"
                value={project.inviteRole}
                onChange={(role) => changeRole.mutate(role)}
                options={[
                  { value: "editor", label: "Редактировать", icon: <Pencil size={18} /> },
                  { value: "viewer", label: "Только смотреть", icon: <Eye size={18} /> },
                ]}
              />
              <Button size="sm" variant="ghost" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
                <RefreshCw size={13} className={regenerate.isPending ? "animate-spin" : undefined} />
                Сделать новую ссылку (старая перестанет работать)
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">
              По этой ссылке участники получают роль «{project.inviteRole === "editor" ? "редактор" : "наблюдатель"}».
            </p>
          )}
        </section>

        {isOwner && (
          <section className="space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-medium">Или пригласить по email</h3>
            <p className="-mt-2 text-xs text-muted">Подойдёт, если человек уже зарегистрирован.</p>
            {inviteByEmail.error && (
              <ErrorNote>
                {inviteByEmail.error instanceof ApiError ? inviteByEmail.error.message : "Не удалось пригласить"}
              </ErrorNote>
            )}
            {inviteByEmail.isSuccess && !inviteByEmail.isPending && <p className="text-xs text-ok">Участник добавлен</p>}
            <form onSubmit={submitEmail} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                aria-label="Email участника"
                className="field"
              />
              <select
                value={emailRole}
                onChange={(event) => setEmailRole(event.target.value as InviteRole)}
                aria-label="Роль"
                className="field w-36 shrink-0"
              >
                <option value="editor">редактор</option>
                <option value="viewer">наблюдатель</option>
              </select>
              <Button type="submit" disabled={!email.trim() || inviteByEmail.isPending}>
                Добавить
              </Button>
            </form>
          </section>
        )}
      </div>
    </Modal>
  );
}
