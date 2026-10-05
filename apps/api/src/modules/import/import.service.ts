import { prisma } from "@collab/db";
import type { ImportResult } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { downloadRepoZip, parseGithubUrl, type RepoRef } from "../../lib/github.js";
import { GithubApi } from "../../lib/github-api.js";
import { extractRepoFiles } from "../../lib/repo-files.js";
import { textToYjsState } from "../../lib/yjs-text.js";

/** The name of a public repository's default branch, or `null` when GitHub cannot be asked. */
export async function defaultBranchName(repo: RepoRef, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const info = await new GithubApi("", fetchImpl).get<{ default_branch?: unknown }>(`/repos/${repo.owner}/${repo.repo}`);
    return typeof info.default_branch === "string" ? info.default_branch : null;
  } catch {
    return null;
  }
}

/** Downloads a branch of a repository and adds its files to the project under `branch`. */
export async function importRepoFiles(
  projectId: string,
  branch: string,
  repo: RepoRef,
  fetchImpl: typeof fetch = fetch,
) {
  const zip = await downloadRepoZip(repo, fetchImpl);
  const { files, skipped, skippedPaths } = extractRepoFiles(zip);

  const existing = new Set(
    (await prisma.file.findMany({ where: { projectId, branch }, select: { path: true } })).map((file) => file.path),
  );
  const fresh = files.filter((file) => !existing.has(file.path));

  const created = await prisma.file.createMany({
    data: fresh.map((file) => ({
      projectId,
      branch,
      path: file.path,
      type: file.type,
      language: file.language,
      yjsState: Buffer.from(textToYjsState(file.text)),
      sourceSha: file.sha,
    })),
    skipDuplicates: true,
  });

  return { imported: created.count, skipped: { ...skipped, existing: files.length - created.count }, skippedPaths };
}

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

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  let branch = project.githubBranch ?? "";

  if (!project.githubOwner) {
    // The first repository becomes the project's link, and its branch gets a name, so that other
    // branches can be opened later. Files created before the link join that branch.
    const name = repo.ref ?? (await defaultBranchName(repo, fetchImpl));
    branch = name ?? "";
    await prisma.$transaction([
      prisma.project.update({
        where: { id: projectId },
        data: { githubOwner: repo.owner, githubRepo: repo.repo, githubBranch: name },
      }),
      ...(name ? [prisma.file.updateMany({ where: { projectId, branch: "" }, data: { branch: name } })] : []),
    ]);
  }

  const result = await importRepoFiles(projectId, branch, repo, fetchImpl);
  return { repo: { owner: repo.owner, name: repo.repo, ref: repo.ref }, ...result };
}
