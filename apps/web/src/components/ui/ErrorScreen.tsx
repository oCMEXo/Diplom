import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "./Button";

export function ErrorScreen({
  title,
  message,
  onRetry,
  extra,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm animate-pop rounded-2xl bg-surface p-8 text-center shadow-card">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn/15 text-warn">
          <TriangleAlert size={22} />
        </span>
        <h1 className="font-semibold">{title}</h1>
        <p className="mb-5 mt-1.5 text-sm text-muted">{message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Повторить
            </Button>
          )}
          <Link to="/">
            <Button>К моим проектам</Button>
          </Link>
        </div>
        {extra}
      </div>
    </div>
  );
}
