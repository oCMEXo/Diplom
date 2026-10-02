import { Crown, Eye, Pencil } from "lucide-react";
import { cn } from "../../lib/cn";

const ROLES = {
  owner: { label: "владелец", icon: Crown, tone: "bg-warn/15 text-warn" },
  editor: { label: "редактор", icon: Pencil, tone: "bg-accent/15 text-accent" },
  viewer: { label: "наблюдатель", icon: Eye, tone: "bg-raised text-muted" },
} as const;

export type Role = keyof typeof ROLES;

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const { label, icon: Icon, tone } = ROLES[role];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", tone, className)}>
      <Icon size={10} />
      {label}
    </span>
  );
}
