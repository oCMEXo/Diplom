import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectMember } from "@collab/shared";
import { api, ApiError } from "../lib/api";

export function MembersPanel({
  projectId,
  members,
  isOwner,
}: {
  projectId: string;
  members: ProjectMember[];
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/members`, { email, role }),
    onSuccess: () => {
      setEmail("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не удалось пригласить"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) invite.mutate();
  }

  return (
    <div className="space-y-3 border-t border-slate-200 p-3">
      <h2 className="text-xs font-semibold uppercase text-slate-400">Участники</h2>
      <ul className="space-y-1">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between text-sm">
            <span className="truncate text-slate-700">{member.name}</span>
            <span className="text-xs uppercase text-slate-400">{member.role}</span>
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={onSubmit} className="space-y-1">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email участника"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
          />
          <div className="flex gap-1">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="rounded border border-slate-300 px-1 py-1 text-xs"
            >
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="submit"
              disabled={invite.isPending}
              className="flex-1 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Пригласить
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
