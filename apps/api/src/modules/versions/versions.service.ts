import { prisma } from "@collab/db";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { restoreThroughCollab } from "../../lib/collab.js";

// Versions are written by the sync server (apps/collab/src/versions.ts); the API only reads them.

const versionFields = {
  id: true,
  createdAt: true,
  size: true,
  author: { select: { name: true } },
} as const;

function toVersionDto(version: { id: string; createdAt: Date; size: number; author: { name: string } | null }) {
  return {
    id: version.id,
    createdAt: version.createdAt.toISOString(),
    size: version.size,
    authorName: version.author?.name ?? null,
  };
}

async function findFile(projectId: string, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId }, select: { projectId: true, deletedAt: true } });
  if (!file || file.projectId !== projectId || file.deletedAt) {
    throw new AppError("Файл не найден", 404);
  }
}

async function findVersion(fileId: string, versionId: string) {
  const version = await prisma.fileVersion.findFirst({
    where: { id: versionId, fileId },
    select: { ...versionFields, content: true },
  });
  if (!version) throw new AppError("Версия не найдена", 404);
  return version;
}

export async function listVersions(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "viewer");
  await findFile(projectId, fileId);

  const versions = await prisma.fileVersion.findMany({
    where: { fileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: versionFields,
  });
  return versions.map(toVersionDto);
}

export async function getVersion(userId: string, projectId: string, fileId: string, versionId: string) {
  await requireProjectRole(projectId, userId, "viewer");
  await findFile(projectId, fileId);

  const version = await findVersion(fileId, versionId);
  return { ...toVersionDto(version), content: version.content };
}

/**
 * The text is replaced by the sync server inside the live document (see lib/collab.ts); it also
 * keeps the replaced text as a version, so a restore can be undone from the same history.
 */
export async function restoreVersion(
  userId: string,
  projectId: string,
  fileId: string,
  versionId: string,
  fetchImpl: typeof fetch = fetch,
) {
  await requireProjectRole(projectId, userId, "editor");
  await findFile(projectId, fileId);
  await findVersion(fileId, versionId);

  await restoreThroughCollab(userId, fileId, versionId, fetchImpl);
}
