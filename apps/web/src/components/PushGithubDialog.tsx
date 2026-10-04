import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, GitCommitHorizontal } from "lucide-react";
import type { ProjectWithMembers, PushResult } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

const TOKEN_KEY = "collab.github-token";
/** The sync server writes edits to the database within 3 s; wait a little longer before reading them. */
const SYNC_WAIT_MS = 3500;

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

export function PushGithubDialog({ project, onClose }: { project: ProjectWithMembers; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(readToken);
  const [remember, setRemember] = useState(() => readToken() !== "");
  const [message, setMessage] = useState("Update from Collab");
  const [branch, setBranch] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [phase, setPhase] = useState<"idle" | "saving" | "pushing">("idle");

  const linked = project.github;
  const push = useMutation({
    mutationFn: async () => {
      setPhase("saving");
      await new Promise((resolve) => setTimeout(resolve, SYNC_WAIT_MS));
      setPhase("pushing");
      return api.post<PushResult>(`/projects/${project.id}/github/push`, {
        token: token.trim(),
        message: message.trim(),
        ...(branch.trim() ? { branch: branch.trim() } : {}),
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
  const ready = token.trim().length >= 10 && message.trim() && (linked || repoUrl.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) push.mutate();
  }

  return (
    <Modal
      title="Отправить в GitHub"
      description={
        linked
          ? `Изменённые файлы будут отправлены коммитом в ${linked.owner}/${linked.repo}.`
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
        <form onSubmit={submit} className="space-y-4">
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
                Нужен токен с правом записи в этот репозиторий (Contents: Read and write).{" "}
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
          <label className="-mt-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="accent-[rgb(var(--accent))]"
            />
            Запомнить токен в этом браузере
          </label>
          <Field
            label="Сообщение коммита"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            disabled={busy}
          />
          <Field
            label="Ветка"
            placeholder={linked?.branch ?? "основная ветка репозитория"}
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            disabled={busy}
            hint="Если такой ветки нет, она будет создана. Чтобы не трогать основную, отправьте в новую ветку."
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
