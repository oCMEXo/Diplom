import type { ProjectRole } from "@collab/shared";
import { prisma } from "@collab/db";
import { AppError } from "./errors.js";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

export async function requireProjectRole(
  projectId: string,
  userId: string,
  minRole: ProjectRole,
): Promise<ProjectRole> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (!membership) {
    throw new AppError("Project not found", 404);
  }

  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AppError("Insufficient project role", 403);
  }

  return membership.role;
}
