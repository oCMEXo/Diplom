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
    throw new AppError("Проект не найден или у вас нет к нему доступа", 404);
  }

  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AppError("Для этого действия не хватает прав в проекте", 403);
  }

  return membership.role;
}
