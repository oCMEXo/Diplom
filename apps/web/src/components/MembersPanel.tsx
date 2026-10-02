import { UserPlus } from "lucide-react";
import type { ProjectMember } from "@collab/shared";
import { useAuth } from "../lib/auth";
import { useOnlineUsers } from "../lib/RealtimeContext";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { RoleBadge } from "./ui/RoleBadge";

export function MembersPanel({ members, onInvite }: { members: ProjectMember[]; onInvite: () => void }) {
  const { user } = useAuth();
  const online = useOnlineUsers();
  const onlineIds = new Set(online.map((person) => person.id));
  const sorted = [...members].sort(
    (a, b) => Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId)) || a.name.localeCompare(b.name),
  );
  // Guests who came through an invite link are in the project's presence list too.
  const memberIds = new Set(members.map((member) => member.userId));
  const visitors = online.filter((person) => !memberIds.has(person.id));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {sorted.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised/60">
              <Avatar id={member.userId} name={member.name} online={onlineIds.has(member.userId)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.userId === user?.id && <span className="ml-1.5 text-xs font-normal text-faint">это вы</span>}
                </p>
              </div>
              <RoleBadge role={member.role} />
            </li>
          ))}
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
    </div>
  );
}
