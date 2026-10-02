import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { AuthShell } from "../components/layout/AuthShell";
import { Button } from "../components/ui/Button";
import { ErrorNote, Field } from "../components/ui/Field";

export function LoginPage() {
  const { login, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  async function onGuest() {
    setError(null);
    setLoading(true);
    try {
      await continueAsGuest();
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти как гость");
    } finally {
      setLoading(false);
    }
  }

  const registerLink = `/register${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return (
    <AuthShell title="С возвращением" subtitle="Войдите, чтобы продолжить работу над проектами.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Пароль"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" disabled={loading} className="w-full">
          {loading ? "Входим…" : "Войти"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-faint">
          <span className="h-px flex-1 bg-line" />
          или
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button size="lg" onClick={onGuest} disabled={loading} className="w-full">
          <Sparkles size={16} className="text-accent" />
          Продолжить как гость
        </Button>
        <p className="text-center text-xs text-faint">Гостю не нужны ни почта, ни пароль — достаточно открыть ссылку.</p>

        <p className="pt-2 text-center text-sm text-muted">
          Нет аккаунта?{" "}
          <Link to={registerLink} className="font-medium text-accent hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
