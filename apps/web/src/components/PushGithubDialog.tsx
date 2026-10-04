import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, GitBranch, GitCommitHorizontal, LoaderCircle, TriangleAlert } from "lucide-react";
import type { GithubBranchesResult, ProjectWithMembers, PushResult } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

const TOKEN_KEY = "collab.github-token";
/** The sync server writes edits to the database within 3 s; wait a little longer before reading them. */
const SYNC_WAIT_MS = 3500;
const LOOKUP_DELAY_MS = 600;

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage may be blocked; the token then simply is not remembered
  }
}

function suggestBranchName() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `collab-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: GithubBranchesResult }
  | { state: "error"; message: string };

export function PushGithubDialog({ project, onClose }: { project: ProjectWithMembers; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(readToken);
  const [remember, setRemember] = useState(() => readToken() !== "");
  const [message, setMessage] = useState("Update from Collab");
  const [repoUrl, setRepoUrl] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [target, setTarget] = useState<"existing" | "new">("existing");
  const [existingBranch, setExistingBranch] = useState("");
  const [newBranch, setNewBranch] = useState(suggestBranchName);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [phase, setPhase] = useState<"idle" | "saving" | "pushing">("idle");
  const lookupId = useRef(0);

  const linked = project.github;
  const tokenReady = token.trim().length >= 10;
  const repoReady = !!linked || repoUrl.trim().length > 3;

  // Once the token (and repository) are filled in, ask GitHub which branches there are. The token
  // is only ever sent in the request body; nothing here goes into the persisted query cache.
  useEffect(() => {
    if (!tokenReady || !repoReady) {
      setLookup({ state: "idle" });
      return;
    }
    const id = ++lookupId.current;
    setLookup({ state: "loading" });
    const timer = setTimeout(() => {
      api
        .post<GithubBranchesResult>(`/projects/${project.id}/github/branches`, {
          token: token.trim(),
          ...(linked ? {} : { repoUrl: repoUrl.trim() }),
        })
        .then((data) => {
          if (id !== lookupId.current) return;
          setLookup({ state: "ready", data });
          setExistingBranch((current) => (data.branches.includes(current) ? current : data.defaultBranch));
        })
        .catch((error) => {
          if (id !== lookupId.current) return;
          setLookup({ state: "error", message: error instanceof ApiError ? error.message : "Не удалось проверить токен" });
        });
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [token, repoUrl, tokenReady, repoReady, linked, project.id]);

  const branch = target === "new" ? newBranch.trim() : existingBranch;
  const ready = lookup.state === "ready" && lookup.data.canPush && !!branch && !!message.trim();

  const push = useMutation({
    mutationFn: async () => {
      setPhase("saving");
      await new Promise((resolve) => setTimeout(resolve, SYNC_WAIT_MS));
      setPhase("pushing");
      return api.post<PushResult>(`/projects/${project.id}/github/push`, {
        token: token.trim(),
        message: message.trim(),
        branch,
        ...(linked ? {} : { repoUrl: repoUrl.trim() }),
        ...(overwrite ? { overwrite: true } : {}),
      });
    },
    onSuccess: () => {
      storeToken(remember ? token.trim() : null);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onSettled: () => setPhase("idle"),
  });

  const result = push.data;
  const error = push.error instanceof ApiError ? push.error : null;
  const isConflict = error?.status === 409 && error.message.includes("изменились в GitHub");
  const busy = phase !== "idle";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) push.mutate();
  }

  const branches = lookup.state === "ready" ? lookup.data.branches : [];

  return (
    <Modal
      title="Отправить в GitHub"
      description={
        linked
          ? `Изменённые файлы уйдут одним коммитом в ${linked.owner}/${linked.repo}.`
          : "Проект ещё не связан с репозиторием — укажите, куда отправлять."
      }
      onClose={onClose}
      width="max-w-lg"
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-ok/10 p-4 text-sm">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
            <div>
              <p className="font-medium">
                Коммит создан в ветке {result.branch}
                {result.newBranch && " (новая ветка)"}
              </p>
              <p className="mt-1 text-muted">
                Новых файлов — {result.added}, изменённых — {result.modified}, без изменений — {result.unchanged}.
              </p>
              <a
                href={result.commitUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
              >
                Открыть коммит на GitHub <ExternalLink size={13} />
              </a>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Готово
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <ErrorNote>{error.message}</ErrorNote>}
          {isConflict && (
            <label className="flex items-start gap-2 rounded-lg bg-warn/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(event) => setOverwrite(event.target.checked)}
                className="mt-0.5 accent-[rgb(var(--accent))]"
              />
              <span>Всё равно отправить и заменить версии из GitHub (их изменения в этих файлах будут перезаписаны)</span>
            </label>
          )}

          {!linked && (
            <Field
              label="Репозиторий"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              disabled={busy}
            />
          )}

          <div className="space-y-2">
            <Field
              label="Токен GitHub"
              type="password"
              autoComplete="off"
              placeholder="github_pat_…"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy}
              hint={
                <>
                  Нужен токен с записью в репозиторий (Contents: Read and write).{" "}
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                  >
                    Создать токен
                  </a>
                  . Сервер использует его один раз и не сохраняет.
                </>
              }
            />
            {lookup.state === "loading" && (
              <p className="flex items-center gap-2 text-xs text-muted">
                <LoaderCircle size={13} className="animate-spin" /> Проверяем токен и загружаем ветки…
              </p>
            )}
            {lookup.state === "ready" && lookup.data.canPush && (
              <p className="flex items-center gap-2 text-xs text-ok">
                <CheckCircle2 size={13} /> Токен подходит: можно писать в {lookup.data.repo.owner}/{lookup.data.repo.name}
              </p>
            )}
            {lookup.state === "ready" && !lookup.data.canPush && (
              <p className="flex items-center gap-2 text-xs text-warn">
                <TriangleAlert size={13} /> У этого токена нет права записи в репозиторий
              </p>
            )}
            {lookup.state === "error" && (
              <p className="flex items-start gap-2 text-xs text-bad">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {lookup.message}
              </p>
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="accent-[rgb(var(--accent))]"
              />
              Запомнить токен в этом браузере
            </label>
          </div>

          <fieldset className="space-y-2" disabled={busy || lookup.state !== "ready"}>
            <legend className="mb-1 text-xs font-medium text-muted">Куда отправить</legend>
            <div className={cn("grid gap-2 sm:grid-cols-2", lookup.state !== "ready" && "opacity-50")}>
              <label
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-sm transition",
                  target === "existing" ? "border-accent bg-accent/10" : "border-line hover:border-faint",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="target"
                    checked={target === "existing"}
                    onChange={() => setTarget("existing")}
                    className="accent-[rgb(var(--accent))]"
                  />
                  В существующую ветку
                </span>
                <select
                  value={existingBranch}
                  onChange={(event) => {
                    setExistingBranch(event.target.value);
                    setTarget("existing");
                  }}
                  aria-label="Ветка"
                  className="field py-1.5"
                >
                  {branches.length === 0 && <option value="">—</option>}
                  {branches.map((name) => (
                    <option key={name} value={name}>
                      {name}
                      {lookup.state === "ready" && name === lookup.data.defaultBranch ? " (основная)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-sm transition",
                  target === "new" ? "border-accent bg-accent/10" : "border-line hover:border-faint",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="target"
                    checked={target === "new"}
                    onChange={() => setTarget("new")}
                    className="accent-[rgb(var(--accent))]"
                  />
                  <GitBranch size={14} className="text-muted" />В новую ветку
                </span>
                <input
                  value={newBranch}
                  onChange={(event) => {
                    setNewBranch(event.target.value);
                    setTarget("new");
                  }}
                  aria-label="Имя новой ветки"
                  className="field py-1.5 font-mono text-xs"
                />
              </label>
            </div>
            <p className="text-xs text-faint">
              {target === "new"
                ? "Основная ветка не изменится — потом можно открыть pull request."
                : "Коммит попадёт прямо в выбранную ветку."}
            </p>
          </fieldset>

          <Field
            label="Сообщение коммита"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            disabled={busy}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              <GitCommitHorizontal size={15} />
              {phase === "saving" ? "Сохраняем правки…" : phase === "pushing" ? "Отправляем…" : "Отправить"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
