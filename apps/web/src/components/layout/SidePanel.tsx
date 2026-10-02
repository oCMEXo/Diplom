import { useState } from "react";
import { MessageSquare, Users, X } from "lucide-react";
import type { ProjectWithMembers } from "@collab/shared";
import { useOnlineUsers } from "../../lib/RealtimeContext";
import { cn } from "../../lib/cn";
import { ChatPanel } from "../ChatPanel";
import { MembersPanel } from "../MembersPanel";
import { IconButton } from "../ui/Button";

type Tab = "chat" | "members";

export function SidePanel({
  project,
  onInvite,
  onClose,
}: {
  project: ProjectWithMembers;
  onInvite: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const online = useOnlineUsers();

  const tabs: { id: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "chat", label: "Чат", icon: MessageSquare },
    { id: "members", label: "Участники", icon: Users, badge: online.length },
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-2 pr-2">
        <div role="tablist" className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                tab === id ? "bg-raised text-fg" : "text-muted hover:text-fg",
              )}
            >
              <Icon size={15} />
              {label}
              {badge ? (
                <span className="rounded-full bg-ok/20 px-1.5 text-[10px] font-semibold text-ok">{badge}</span>
              ) : null}
            </button>
          ))}
        </div>
        <IconButton label="Скрыть панель" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className={cn("min-h-0 flex-1", tab !== "chat" && "hidden")}>
        <ChatPanel key={project.id} projectId={project.id} />
      </div>
      <div className={cn("min-h-0 flex-1", tab !== "members" && "hidden")}>
        <MembersPanel members={project.members} onInvite={onInvite} />
      </div>
    </div>
  );
}
