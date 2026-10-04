import { Prisma, prisma } from "@collab/db";
import { inferLanguage } from "@collab/shared";
import type { CreateFileInput, UpdateFileInput } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";

function toFileDto(file: {
  id: string;
  projectId: string;
  path: string;
  type: string;
  language: string | null;
  updatedAt: Date;
}) {
  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    type: file.type as "code" | "doc" | "board",
    language: file.language,
    updatedAt: file.updatedAt.toISOString(),
  };
}

export async function listFiles(userId: string, projectId: string) {
  await requireProjectRole(projectId, userId, "viewer");

  const files = await prisma.file.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { path: "asc" },
  });

  return files.map(toFileDto);
}

export async function listTrash(userId: string, projectId: string) {
  await requireProjectRole(projectId, userId, "viewer");

  const files = await prisma.file.findMany({
    where: { projectId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
  });

  return files.map((file) => ({
    ...toFileDto({ ...file, path: file.trashedPath ?? file.path }),
    deletedAt: file.deletedAt!.toISOString(),
  }));
}

export async function createFile(userId: string, projectId: string, input: CreateFileInput) {
  await requireProjectRole(projectId, userId, "editor");

  try {
    const file = await prisma.file.create({
      data: {
        projectId,
        path: input.path,
        type: input.type,
        language: input.language ?? inferLanguage(input.path),
      },
    });
    return toFileDto(file);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Файл с таким именем уже есть", 409);
    }
    throw err;
  }
}

async function findOwnedFile(projectId: string, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId || file.deletedAt) {
    throw new AppError("Файл не найден", 404);
  }
  return file;
}

async function findTrashedFile(projectId: string, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId || !file.deletedAt) {
    throw new AppError("Файла нет в корзине", 404);
  }
  return file;
}

export async function getFile(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "viewer");
  const file = await findOwnedFile(projectId, fileId);
  return toFileDto(file);
}

export async function updateFile(
  userId: string,
  projectId: string,
  fileId: string,
  input: UpdateFileInput,
) {
  await requireProjectRole(projectId, userId, "editor");
  const existing = await findOwnedFile(projectId, fileId);

  try {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: {
        ...(input.path !== undefined ? { path: input.path } : {}),
        // A new extension means a new language, unless the caller names one explicitly.
        ...(input.language !== undefined
          ? { language: input.language }
          : input.path !== undefined && existing.type === "code"
            ? { language: inferLanguage(input.path) }
            : {}),
      },
    });
    return toFileDto(file);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Файл с таким именем уже есть", 409);
    }
    throw err;
  }
}

/** Deleting moves the file to the trash, so a slip of the mouse (or a guest) cannot destroy work. */
export async function deleteFile(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "editor");
  const file = await findOwnedFile(projectId, fileId);
  await prisma.file.update({
    where: { id: fileId },
    data: { deletedAt: new Date(), trashedPath: file.path, path: `.trash/${file.id}/${file.path}` },
  });
}

export async function restoreFile(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "editor");
  const file = await findTrashedFile(projectId, fileId);
  try {
    const restored = await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: null, path: file.trashedPath ?? file.path, trashedPath: null },
    });
    return toFileDto(restored);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Файл с таким именем уже есть: переименуйте его или удалите, чтобы восстановить этот", 409);
    }
    throw err;
  }
}

/** Removing from the trash is final, so only the project's owner can do it. */
export async function purgeFile(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "owner");
  await findTrashedFile(projectId, fileId);
  await prisma.file.delete({ where: { id: fileId } });
}
