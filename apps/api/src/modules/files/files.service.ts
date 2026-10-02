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
    where: { projectId },
    orderBy: { path: "asc" },
  });

  return files.map(toFileDto);
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
      throw new AppError("A file with this path already exists", 409);
    }
    throw err;
  }
}

async function findOwnedFile(projectId: string, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId) {
    throw new AppError("File not found", 404);
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
  await findOwnedFile(projectId, fileId);

  try {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: {
        ...(input.path !== undefined ? { path: input.path } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
      },
    });
    return toFileDto(file);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("A file with this path already exists", 409);
    }
    throw err;
  }
}

export async function deleteFile(userId: string, projectId: string, fileId: string) {
  await requireProjectRole(projectId, userId, "editor");
  await findOwnedFile(projectId, fileId);
  await prisma.file.delete({ where: { id: fileId } });
}
