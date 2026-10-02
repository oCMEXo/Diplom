import type { ReactNode } from "react";
import { Cloud, CloudOff, Menu, PanelRight, UserPlus } from "lucide-react";
import { useOnlineUsers } from "../../lib/RealtimeContext";
import { cn } from "../../lib/cn";
import { AvatarStack } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";

export type SyncStatus = "connecting" | "connected" | "offline";

export interface ShellActions {
  openNav: () => void;
  togglePanel: () => void;
  panelOpen: boolean;
  openInvite: () => void;
}

export function SyncPill({ status }: { status: SyncStatus }) {
  const config = {
    connected: { label: "Синхронизировано", tone: "bg-ok/12 text-ok", icon: Cloud },
    connecting: { label: "Подключение…", tone: "bg-warn/12 text-warn", icon: Cloud },
    offline: { label: "Офлайн — правки сохранятся локально", tone: "bg-warn/12 text-warn", icon: CloudOff },
  }[status];
  return (
    <span className={cn("hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex", config.tone)}>
      <config.icon size={13} />
      {config.label}
    </span>
  );
}

export function ProjectHeader({
  shell,
  icon,
  title,
  badge,
  status,
  actions,
}: {
  shell: ShellActions;
  icon?: ReactNode;
  title: string;
  badge?: ReactNode;
  status?: SyncStatus;
  actions?: ReactNode;
}) {
  const online = useOnlineUsers();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <IconButton label="Меню проекта" onClick={shell.openNav} className="lg:hidden">
        <Menu size={19} />
      </IconButton>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {badge}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {status && <SyncPill status={status} />}
        {actions}
        {online.length > 0 && (
          <span className="hidden sm:block" title={`Сейчас здесь: ${online.map((person) => person.name).join(", ")}`}>
            <AvatarStack users={online} />
          </span>
        )}
        <Button size="sm" onClick={shell.openInvite} className="hidden md:inline-flex">
          <UserPlus size={14} />
          Пригласить
        </Button>
        <IconButton
          label={shell.panelOpen ? "Скрыть чат и участников" : "Показать чат и участников"}
          onClick={shell.togglePanel}
          active={shell.panelOpen}
        >
          <PanelRight size={18} />
        </IconButton>
      </div>
    </header>
  );
}
