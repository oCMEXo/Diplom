import { prisma } from "@collab/db";
import type { ProjectRole } from "@collab/shared";
import { verifyAccessToken } from "./jwt.js";

export interface FileAccess {
  userId: string;
  projectId: string;
  role: ProjectRole;
}

export async function resolveFileAccess(token: string, fileId: string): Promise<FileAccess> {
  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    throw new Error("Invalid or expired token");
  }

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt) {
    throw new Error("File not found");
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: file.projectId, userId } },
  });
  if (!membership) {
    throw new Error("Not a member of this project");
  }

  return { userId, projectId: file.projectId, role: membership.role };
}
