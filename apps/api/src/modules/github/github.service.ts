import { prisma } from "@collab/db";
import type { GithubBranchesInput, GithubBranchesResult, PushGithubInput, PushResult } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { gitBlobSha } from "../../lib/git-blob.js";
import { GithubApi } from "../../lib/github-api.js";
import { parseGithubUrl } from "../../lib/github.js";
import { yjsStateToText } from "../../lib/yjs-text.js";

const BRANCH = /^(?!-)[A-Za-z0-9._/-]{1,200}$/;

interface RepoInfo {
  default_branch: string;
  permissions?: { push?: boolean };
}
interface RefInfo {
  object: { sha: string };
}
interface TreeInfo {
  truncated: boolean;
  tree: { path: string; mode: string; type: string; sha: string }[];
}

function validBranch(name: string) {
  return BRANCH.test(name) && !name.includes("..") && !name.endsWith("/") && !name.endsWith(".lock");
}

const encodeRef = (name: string) => name.split("/").map(encodeURIComponent).join("/");

/** The repository a project pushes to: its saved link, or the one given in the request. */
function resolveRepo(
  project: { githubOwner: string | null; githubRepo: string | null; githubBranch: string | null },
  repoUrl?: string,
) {
  if (project.githubOwner && project.githubRepo) {
    return { owner: project.githubOwner, repo: project.githubRepo, linkedBranch: project.githubBranch, needsLink: false };
  }
  const parsed = repoUrl ? parseGithubUrl(repoUrl) : null;
  if (!parsed) throw new AppError("Проект не связан с репозиторием GitHub: укажите ссылку на него.", 400);
  return { owner: parsed.owner, repo: parsed.repo, linkedBranch: parsed.ref, needsLink: true };
}

/** Branches of the project's repository, so the push dialog can offer a list instead of a text box. */
export async function listBranches(
  userId: string,
  projectId: string,
  input: GithubBranchesInput,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubBranchesResult> {
  await requireProjectRole(projectId, userId, "editor");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const { owner, repo, linkedBranch } = resolveRepo(project, input.repoUrl);
  const slug = `${owner}/${repo}`;
  const api = new GithubApi(input.token, fetchImpl);

  const info = await api.get<RepoInfo>(`/repos/${slug}`);
  const found = await api.get<{ name: string }[]>(`/repos/${slug}/branches?per_page=100`);
  const defaultBranch = linkedBranch ?? info.default_branch;
  const names = found.map((branch) => branch.name).filter((name) => name !== defaultBranch);

  return {
    repo: { owner, name: repo },
    defaultBranch,
    branches: [defaultBranch, ...names],
    canPush: info.permissions?.push ?? true,
  };
}

/**
 * Commits the project's changed text files to the linked GitHub repository.
 *
 * What counts as changed is decided by comparing each file's git blob SHA with the repository's
 * tree. A file edited here (its SHA differs from the one recorded at the last sync) is new when
 * the path is missing and modified otherwise, but only if the repository still holds the version it
 * was synced from; otherwise someone changed it on GitHub meanwhile and the push stops unless
 * `overwrite` is set. Files not edited here are never sent, so other people's commits stay intact.
 */
export async function pushToGithub(
  userId: string,
  projectId: string,
  input: PushGithubInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  await requireProjectRole(projectId, userId, "editor");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const { owner, repo, linkedBranch, needsLink } = resolveRepo(project, input.repoUrl);
  const slug = `${owner}/${repo}`;
  const api = new GithubApi(input.token, fetchImpl);

  const info = await api.get<RepoInfo>(`/repos/${slug}`);
  if (info.permissions && !info.permissions.push) {
    throw new AppError("У токена нет прав на запись в этот репозиторий (нужен доступ Contents: write).", 403);
  }

  const baseBranch = linkedBranch ?? info.default_branch;
  const target = input.branch?.trim() || baseBranch;
  if (!validBranch(target)) throw new AppError("Недопустимое имя ветки.", 400);

  const targetRef = await api.getOrNull<RefInfo>(`/repos/${slug}/git/ref/heads/${encodeRef(target)}`);
  const newBranch = !targetRef;
  const headSha = targetRef
    ? targetRef.object.sha
    : (await api.get<RefInfo>(`/repos/${slug}/git/ref/heads/${encodeRef(baseBranch)}`)).object.sha;

  const headCommit = await api.get<{ tree: { sha: string } }>(`/repos/${slug}/git/commits/${headSha}`);
  const remoteTree = await api.get<TreeInfo>(`/repos/${slug}/git/trees/${headCommit.tree.sha}?recursive=1`);
  if (remoteTree.truncated) {
    throw new AppError("Репозиторий слишком большой для отправки изменений из браузера.", 413);
  }
  const remote = new Map(remoteTree.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry]));

  const files = await prisma.file.findMany({ where: { projectId, type: { not: "board" }, deletedAt: null } });
  const changes: { path: string; mode: string; content: string; id: string; sha: string }[] = [];
  const conflicts: string[] = [];
  const inSync: { id: string; sha: string }[] = [];
  let added = 0;
  let modified = 0;
  let untouched = 0;

  for (const file of files) {
    const content = yjsStateToText(file.yjsState);
    const sha = gitBlobSha(content);
    const existing = remote.get(file.path);

    // Untouched here since the last sync: whatever GitHub holds now is not ours to send.
    const editedHere = file.sourceSha === null || sha !== file.sourceSha;

    if (existing?.sha === sha) {
      inSync.push({ id: file.id, sha });
    } else if (!editedHere) {
      untouched += 1;
    } else if (!existing) {
      if (content === "") continue;
      changes.push({ path: file.path, mode: "100644", content, id: file.id, sha });
      added += 1;
    } else if (file.sourceSha === existing.sha || input.overwrite || newBranch) {
      changes.push({ path: file.path, mode: existing.mode, content, id: file.id, sha });
      modified += 1;
    } else {
      conflicts.push(file.path);
    }
  }

  if (conflicts.length > 0) {
    const shown = conflicts.slice(0, 5).join(", ");
    const more = conflicts.length > 5 ? ` и ещё ${conflicts.length - 5}` : "";
    throw new AppError(
      `Эти файлы изменились в GitHub с момента импорта: ${shown}${more}. Отправка заменила бы чужие изменения.`,
      409,
    );
  }
  if (changes.length === 0) {
    throw new AppError("Нет изменений для отправки: файлы проекта совпадают с репозиторием.", 409);
  }

  const tree = await api.post<{ sha: string }>(`/repos/${slug}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree: changes.map(({ path, mode, content }) => ({ path, mode, type: "blob", content })),
  });
  const commit = await api.post<{ sha: string; html_url: string }>(`/repos/${slug}/git/commits`, {
    message: input.message,
    tree: tree.sha,
    parents: [headSha],
  });
  if (newBranch) {
    await api.post(`/repos/${slug}/git/refs`, { ref: `refs/heads/${target}`, sha: commit.sha });
  } else {
    await api.patch(`/repos/${slug}/git/refs/heads/${encodeRef(target)}`, { sha: commit.sha, force: false });
  }

  // The files now match the repository; remember that, so the next push only sends new edits.
  const synced = target === baseBranch ? [...inSync, ...changes] : [];
  await prisma.$transaction([
    ...synced.map(({ id, sha }) => prisma.file.update({ where: { id }, data: { sourceSha: sha } })),
    ...(needsLink
      ? [prisma.project.update({ where: { id: projectId }, data: { githubOwner: owner, githubRepo: repo, githubBranch: linkedBranch } })]
      : []),
  ]);

  return {
    repo: { owner: owner!, name: repo! },
    branch: target,
    newBranch,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
    added,
    modified,
    unchanged: inSync.length + untouched,
  };
}
