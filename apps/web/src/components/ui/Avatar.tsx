import { colorForUser, initials } from "../../lib/colors";
import { cn } from "../../lib/cn";

const SIZES = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" };

export function Avatar({
  id,
  name,
  size = "md",
  online,
  ring,
  className,
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  /** `undefined` hides the presence dot. */
  online?: boolean;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        title={name}
        style={{ backgroundColor: colorForUser(id) }}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-full font-semibold text-black/75",
          SIZES[size],
          ring && "ring-2 ring-surface",
        )}
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          title={online ? "в сети" : "не в сети"}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface",
            online ? "bg-ok" : "bg-faint",
          )}
        />
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users: { id: string; name: string }[]; max?: number }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((user) => (
        <Avatar key={user.id} id={user.id} name={user.name} size="sm" ring />
      ))}
      {rest > 0 && (
        <span className="z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-raised px-1 text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </span>
  );
}
