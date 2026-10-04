import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GitBranch } from "lucide-react";
import { IMPORT_LIMITS, type ImportResult, type ProjectWithMembers } from "@collab/shared";
import { repoSlug } from "../lib/github-url";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { ErrorNote, Field } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function describeSkipped(skipped: ImportResult["skipped"]) {
  const parts: string[] = [];
  if (skipped.existing) parts.push(`уже были в проекте — ${skipped.existing}`);
  if (skipped.ignored) parts.push(`служебные и зависимости — ${skipped.ignored}`);
  if (skipped.binary) parts.push(`бинарные — ${skipped.binary}`);
  if (skipped.tooLarge) parts.push(`слишком большие — ${skipped.tooLarge}`);
  if (skipped.overLimit) parts.push(`сверх лимита — ${skipped.overLimit}`);
  return parts;
}

export function ImportGithubDialog({ project, onClose }: { project: ProjectWithMembers; onClose: () => void }) {
  const projectId = project.id;
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");

  const importRepo = useMutation({
    mutationFn: (value: string) => api.post<ImportResult>(`/projects/${projectId}/import/github`, { url: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files", projectId] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (url.trim() && !importRepo.isPending) importRepo.mutate(url.trim());
  }

  const linkedSlug = project.github ? `${project.github.owner}/${project.github.repo}`.toLowerCase() : null;
  const typedSlug = repoSlug(url);
  const mixesRepos = !!linkedSlug && !!typedSlug && typedSlug !== linkedSlug;
  const result = importRepo.data;
  const skipped = result ? describeSkipped(result.skipped) : [];

  return (
    <Modal
      title="Импорт из GitHub"
      description="Вставьте ссылку на публичный репозиторий — файлы появятся в проекте, и можно сразу звать коллег."
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-ok/10 p-4 text-sm">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
            <div>
              <p className="font-medium">
                {result.repo.owner}/{result.repo.name}: добавлено файлов — {result.imported}
              </p>
              {skipped.length > 0 && <p className="mt-1 text-muted">Пропущено: {skipped.join("; ")}.</p>}
              {result.skippedPaths.length > 0 && (
                <p className="mt-1 break-words font-mono text-xs text-faint">{result.skippedPaths.join(", ")}</p>
              )}
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
          {importRepo.error && (
            <ErrorNote>
              {importRepo.error instanceof ApiError ? importRepo.error.message : "Не удалось импортировать репозиторий"}
            </ErrorNote>
          )}
          {mixesRepos && (
            <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              Этот проект связан с {project.github!.owner}/{project.github!.repo}. Файлы из другого репозитория
              добавятся к нему и смешаются с текущими. Для другого репозитория лучше создать новый проект.
            </p>
          )}
          <Field
            label="Ссылка на репозиторий"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={importRepo.isPending}
            hint={`Подойдёт и ссылка на ветку (…/tree/dev). Берутся текстовые файлы: до ${IMPORT_LIMITS.maxFiles} файлов, каждый до ${IMPORT_LIMITS.maxFileBytes / 1024} КБ; node_modules, сборка и бинарные файлы пропускаются.`}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={importRepo.isPending}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={!url.trim() || importRepo.isPending}>
              <GitBranch size={15} />
              {importRepo.isPending ? "Загружаем…" : "Импортировать"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
