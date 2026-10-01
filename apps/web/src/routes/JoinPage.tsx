import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="max-w-sm rounded-lg bg-white p-8 text-center shadow">
        {error ? (
          <>
            <p className="mb-2 text-sm font-medium text-red-700">Не получилось присоединиться</p>
            <p className="text-sm text-slate-500">{error}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Присоединяемся к проекту...</p>
        )}
      </div>
    </div>
  );
}
