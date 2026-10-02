import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { LinkIcon, TriangleAlert } from "lucide-react";
import type { Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Wordmark } from "../components/ui/Logo";

export function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const { isAuthenticated } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !code || attempted.current) return;
    attempted.current = true;
    api
      .post<Project>(`/join/${code}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось присоединиться"));
  }, [isAuthenticated, code]);

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`/join/${code}`)}`} replace />;
  }

  if (project) {
    return <Navigate to={`/projects/${project.id}`} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-5">
      <Wordmark />
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 text-center shadow-card animate-pop">
        {error ? (
          <>
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bad/15 text-bad">
              <TriangleAlert size={22} />
            </span>
            <p className="font-semibold">Не получилось присоединиться</p>
            <p className="mb-5 mt-1.5 text-sm text-muted">{error}</p>
            <Link to="/">
              <Button>К моим проектам</Button>
            </Link>
          </>
        ) : (
          <>
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <LinkIcon size={22} />
            </span>
            <p className="font-semibold">Присоединяемся к проекту</p>
            <div className="mt-4 flex justify-center">
              <Spinner />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
