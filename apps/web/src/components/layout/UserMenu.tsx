import { useEffect, useRef, useState } from "react";
import { LogOut, Moon, Pencil, Sun } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { Avatar } from "../ui/Avatar";
import { ChangeNameDialog } from "../ChangeNameDialog";
import { cn } from "../../lib/cn";

export function UserMenu({ placement = "below" }: { placement?: "below" | "above-right" }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label="Меню профиля"
        aria-expanded={open}
        className="rounded-full transition hover:ring-2 hover:ring-accent/50"
      >
        <Avatar id={user.id} name={user.name} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-60 rounded-xl bg-surface p-1.5 shadow-pop animate-pop",
            placement === "below" ? "right-0 top-full mt-2" : "bottom-0 left-full ml-3",
          )}
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar id={user.id} name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted">{user.isGuest ? "Гость · без регистрации" : "Аккаунт"}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-fg"
          >
            <Pencil size={16} />
            Изменить имя
          </button>
          <button
            role="menuitem"
            onClick={toggle}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-fg"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </button>
          <button
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-bad transition hover:bg-bad/10"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      )}
      {renaming && <ChangeNameDialog onClose={() => setRenaming(false)} />}
    </div>
  );
}
