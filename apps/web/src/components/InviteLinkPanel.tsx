import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InviteLink, InviteRole } from "@collab/shared";
import { api } from "../lib/api";

export function InviteLinkPanel({
  projectId,
  inviteCode,
  inviteRole,
  isOwner,
}: {
  projectId: string;
  inviteCode: string;
  inviteRole: InviteRole;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join/${inviteCode}`;

  const regenerate = useMutation({
    mutationFn: () => api.post<InviteLink>(`/projects/${projectId}/invite/regenerate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  const changeRole = useMutation({
    mutationFn: (role: InviteRole) => api.patch<InviteLink>(`/projects/${projectId}/invite`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — user can still select the text manually
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 p-3">
      <h2 className="text-xs font-semibold uppercase text-slate-400">Ссылка-приглашение</h2>
      <div className="flex gap-1">
        <input
          readOnly
          value={link}
          onClick={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
        />
        <button
          onClick={copyLink}
          className="shrink-0 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
        >
          {copied ? "✓" : "Копировать"}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Любой, у кого есть ссылка (включая гостей без регистрации), присоединится с ролью{" "}
        <span className="font-medium">{inviteRole}</span>.
      </p>
      {isOwner && (
        <div className="flex gap-1">
          <select
            value={inviteRole}
            onChange={(e) => changeRole.mutate(e.target.value as InviteRole)}
            className="rounded border border-slate-300 px-1 py-1 text-xs"
          >
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Обновить ссылку
          </button>
        </div>
      )}
    </div>
  );
}
