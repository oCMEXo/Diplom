import { prisma } from "@collab/db";

/**
 * The branch whose files a project shows. Files carry the branch they belong to; "" means the
 * project is not tied to a GitHub branch (no repository yet, or its default branch name unknown).
 */
export async function activeBranch(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { githubBranch: true } });
  return project?.githubBranch ?? "";
}
