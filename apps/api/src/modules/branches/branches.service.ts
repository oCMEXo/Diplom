import { prisma } from "@collab/db";
import type { BranchList, BranchSwitchResult } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { GithubApi } from "../../lib/github-api.js";
import { hub } from "../../lib/hub.js";
import { defaultBranchName, importRepoFiles } from "../import/import.service.js";

const BRANCH = /^(?!-)[A-Za-z0-9._/-]{1,200}$/;

async function linkedProject(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.githubOwner || !project.githubRepo) {
    throw new AppError("Проект не связан с репозиторием GitHub: сначала импортируйте его.", 400);
  }
  return { ...project, githubOwner: project.githubOwner, githubRepo: project.githubRepo };
}

/**
 * A project imported before branches had names keeps its files under "". Before opening another
 * branch, those files get the name of the branch they came from (the repository's default).
 */
async function nameCurrentBranch(project: Awaited<ReturnType<typeof linkedProject>>, fetchImpl: typeof fetch) {
  if (project.githubBranch) return project.githubBranch;
  const name = await defaultBranchName({ owner: project.githubOwner, repo: project.githubRepo, ref: null }, fetchImpl);
  if (!name) throw new AppError("Не удалось узнать основную ветку репозитория. Попробуйте позже.", 502);
  await prisma.$transaction([
    prisma.file.updateMany({ where: { projectId: project.id, branch: "" }, data: { branch: name } }),
    prisma.project.update({ where: { id: project.id }, data: { githubBranch: name } }),
  ]);
  return name;
}

/** Branches of the project's (public) repository, and which of them already have files here. */
export async function listProjectBranches(
  userId: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BranchList> {
  await requireProjectRole(projectId, userId, "viewer");
  const project = await linkedProject(projectId);
  const slug = `${project.githubOwner}/${project.githubRepo}`;
  const api = new GithubApi("", fetchImpl);

  const [info, found] = await Promise.all([
    api.get<{ default_branch: string }>(`/repos/${slug}`),
    api.get<{ name: string }[]>(`/repos/${slug}/branches?per_page=100`),
  ]);
  const loaded = await prisma.file.findMany({
    where: { projectId, branch: { not: "" } },
    distinct: ["branch"],
    select: { branch: true },
  });

  const names = found.map((branch) => branch.name);
  const ordered = [info.default_branch, ...names.filter((name) => name !== info.default_branch).sort()];
  return {
    repo: { owner: project.githubOwner, name: project.githubRepo },
    active: project.githubBranch ?? info.default_branch,
    defaultBranch: info.default_branch,
    branches: ordered.filter((name) => names.includes(name) || name === info.default_branch),
    loaded: loaded.map((row) => row.branch),
  };
}

/**
 * Makes another branch the project's active one, for everybody in the project. Each branch keeps its
 * own files: the first visit downloads the branch from GitHub, later visits show the files as they
 * were left, including edits nobody has pushed yet.
 */
export async function switchBranch(
  userId: string,
  projectId: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BranchSwitchResult> {
  await requireProjectRole(projectId, userId, "editor");
  const target = name.trim();
  if (!BRANCH.test(target) || target.includes("..") || target.endsWith("/")) {
    throw new AppError("Недопустимое имя ветки.", 400);
  }

  const project = await linkedProject(projectId);
  const current = await nameCurrentBranch(project, fetchImpl);
  if (current === target) return { branch: target, imported: 0 };

  const known = await prisma.file.count({ where: { projectId, branch: target } });
  let imported = 0;
  if (known === 0) {
    const result = await importRepoFiles(
      projectId,
      target,
      { owner: project.githubOwner, repo: project.githubRepo, ref: target },
      fetchImpl,
    );
    imported = result.imported;
  }

  await prisma.project.update({ where: { id: projectId }, data: { githubBranch: target } });
  hub.broadcast(projectId, { type: "project.branch", projectId, branch: target });
  return { branch: target, imported };
}
