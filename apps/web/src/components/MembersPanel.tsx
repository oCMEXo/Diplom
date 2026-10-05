import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinus, UserPlus } from "lucide-react";
import type { InviteRole, ProjectMember } from "@collab/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useOnlineUsers } from "../lib/RealtimeContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { RoleBadge } from "./ui/RoleBadge";

export function MembersPanel({
  projectId,
  members,
  isOwner,
  onInvite,
}: {
  projectId: string;
  members: ProjectMember[];
  isOwner: boolean;
  onInvite: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnlineUsers();
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  const onlineIds = new Set(online.map((person) => person.id));
  const sorted = [...members].sort(
    (a, b) => Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId)) || a.name.localeCompare(b.name),
  );
  // Guests who came through an invite link are in the project's presence list too.
  const memberIds = new Set(members.map((member) => member.userId));
  const visitors = online.filter((person) => !memberIds.has(person.id));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InviteRole }) =>
      api.patch(`/projects/${projectId}/members/${userId}`, { role }),
    onSuccess: refresh,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {sorted.map((member) => {
            const manageable = isOwner && member.role !== "owner";
            return (
              <li key={member.userId} className="group/member flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised/60">
                <Avatar id={member.userId} name={member.name} online={onlineIds.has(member.userId)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.name}
                    {member.userId === user?.id && <span className="ml-1.5 text-xs font-normal text-faint">это вы</span>}
                  </p>
                </div>
                {manageable ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={member.role}
                      onChange={(event) => changeRole.mutate({ userId: member.userId, role: event.target.value as InviteRole })}
                      aria-label={`Роль: ${member.name}`}
                      className="rounded-md border border-line bg-canvas px-1.5 py-1 text-[11px] text-muted transition focus:border-accent focus:outline-none"
                    >
                      <option value="editor">редактор</option>
                      <option value="viewer">наблюдатель</option>
                    </select>
                    <button
                      onClick={() => setRemoving(member)}
                      aria-label={`Убрать из проекта: ${member.name}`}
                      title="Убрать из проекта"
                      className="rounded p-1 text-faint opacity-0 transition hover:bg-bad/15 hover:text-bad focus-visible:opacity-100 group-hover/member:opacity-100"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </li>
            );
          })}
          {visitors.map((person) => (
            <li key={person.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised/60">
              <Avatar id={person.id} name={person.name} online />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {person.name}
                {person.isGuest && <span className="ml-1.5 text-xs font-normal text-faint">гость</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line p-3">
        <Button className="w-full" onClick={onInvite}>
          <UserPlus size={15} />
          Пригласить
        </Button>
      </div>

      {removing && (
        <ConfirmDialog
          title="Убрать из проекта?"
          description={`${removing.name} сразу потеряет доступ к проекту: открытые у него вкладки закроются. Вернуться можно будет по ссылке-приглашению.`}
          confirmLabel="Убрать"
          danger
          action={() => api.delete(`/projects/${projectId}/members/${removing.userId}`)}
          onDone={refresh}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
