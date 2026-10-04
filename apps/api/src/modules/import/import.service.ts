import { prisma } from "@collab/db";
import type { ImportResult } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { downloadRepoZip, parseGithubUrl } from "../../lib/github.js";
import { extractRepoFiles } from "../../lib/repo-files.js";
import { textToYjsState } from "../../lib/yjs-text.js";

export async function importFromGithub(
  userId: string,
  projectId: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult> {
  await requireProjectRole(projectId, userId, "editor");

  const repo = parseGithubUrl(url);
  if (!repo) {
    throw new AppError("Не похоже на ссылку на репозиторий GitHub. Пример: https://github.com/owner/repo", 400);
  }

  const zip = await downloadRepoZip(repo, fetchImpl);
  const { files, skipped, skippedPaths } = extractRepoFiles(zip);

  const existing = new Set(
    (await prisma.file.findMany({ where: { projectId }, select: { path: true } })).map((file) => file.path),
  );
  const fresh = files.filter((file) => !existing.has(file.path));

  const created = await prisma.file.createMany({
    data: fresh.map((file) => ({
      projectId,
      path: file.path,
      type: file.type,
      language: file.language,
      yjsState: Buffer.from(textToYjsState(file.text)),
      sourceSha: file.sha,
    })),
    skipDuplicates: true,
  });

  // The first repository an import comes from becomes the project's GitHub link, which "push" uses.
  await prisma.project.updateMany({
    where: { id: projectId, githubOwner: null },
    data: { githubOwner: repo.owner, githubRepo: repo.repo, githubBranch: repo.ref },
  });

  return {
    repo: { owner: repo.owner, name: repo.repo, ref: repo.ref },
    imported: created.count,
    skipped: { ...skipped, existing: files.length - created.count },
    skippedPaths,
  };
}
