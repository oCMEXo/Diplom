import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, LinkIcon, Pencil, Sparkles, TriangleAlert } from "lucide-react";
import type { InvitePreview, Project } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { gradientFor, initials } from "../lib/colors";
import { Button } from "../components/ui/Button";
import { ErrorNote, Field } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";
import { Wordmark } from "../components/ui/Logo";
import { ThemeToggle } from "../components/layout/ThemeToggle";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-5 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Wordmark />
      <div className="w-full max-w-sm animate-pop rounded-2xl bg-surface p-8 shadow-card">{children}</div>
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bad/15 text-bad">
          <TriangleAlert size={22} />
        </span>
        <p className="font-semibold">Не получилось присоединиться</p>
        <p className="mb-5 mt-1.5 text-sm text-muted">{message}</p>
        <Link to="/">
          <Button>К моим проектам</Button>
        </Link>
      </div>
    </Shell>
  );
}

/** What a person sees when they open an invite link without being signed in. */
function InviteLanding({ code, preview }: { code: string; preview: InvitePreview }) {
  const { continueAsGuest } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const redirect = encodeURIComponent(`/join/${code}`);

  async function enterAsGuest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await continueAsGuest(name.trim() || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти как гость");
      setLoading(false);
    }
  }

  const canEdit = preview.role === "editor";

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center">
          <span
            style={{ background: gradientFor(preview.projectName) }}
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-black/70"
          >
            {initials(preview.projectName)}
          </span>
          <p className="text-sm text-muted">{preview.ownerName} приглашает вас в проект</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{preview.projectName}</h1>
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs text-muted">
            {canEdit ? <Pencil size={12} /> : <Eye size={12} />}
            {canEdit ? "Вы сможете редактировать файлы" : "Вы сможете смотреть, но не менять"}
          </p>
        </div>

        <form onSubmit={enterAsGuest} className="space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field
            label="Как вас зовут?"
            placeholder="Например, Влад"
            maxLength={100}
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint="Имя увидят остальные участники. Регистрация не нужна."
          />
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            <Sparkles size={16} />
            {loading ? "Заходим…" : "Присоединиться как гость"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted">
          Уже есть аккаунт?{" "}
          <Link to={`/login?redirect=${redirect}`} className="font-medium text-accent hover:underline">
            Войти
          </Link>{" "}
          или{" "}
          <Link to={`/register?redirect=${redirect}`} className="font-medium text-accent hover:underline">
            создать
          </Link>
        </p>
      </div>
    </Shell>
  );
}

export function JoinPage() {
  const { code = "" } = useParams<{ code: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  const preview = useQuery({
    queryKey: ["invite-preview", code],
    queryFn: () => api.get<InvitePreview>(`/join/${code}`),
    enabled: !isAuthenticated && !!code,
    retry: false,
  });

  useEffect(() => {
    if (!isAuthenticated || !code || attempted.current) return;
    attempted.current = true;
    api
      .post<Project>(`/join/${code}`)
      .then((project) => navigate(`/projects/${project.id}`, { replace: true }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось присоединиться"));
  }, [isAuthenticated, code, navigate]);

  if (isAuthenticated) {
    if (error) return <Failure message={error} />;
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <LinkIcon size={22} />
          </span>
          <p className="font-semibold">Присоединяемся к проекту</p>
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        </div>
      </Shell>
    );
  }

  if (preview.isError) {
    return (
      <Failure
        message={preview.error instanceof ApiError ? preview.error.message : "Не удалось открыть приглашение"}
      />
    );
  }
  if (!preview.data) {
    return (
      <Shell>
        <div className="flex justify-center">
          <Spinner />
        </div>
      </Shell>
    );
  }
  return <InviteLanding code={code} preview={preview.data} />;
}
