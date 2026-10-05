import { randomUUID } from "node:crypto";
import { prisma } from "@collab/db";
import { MAX_RUN_FILES, MAX_RUN_FILES_BYTES, inferLanguage, toRunnableLanguage } from "@collab/shared";
import type { RunJob } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { enqueueRun } from "../../lib/queue.js";
import { yjsStateToText } from "../../lib/yjs-text.js";

/**
 * The rest of the project's text files, so the program can import its neighbours. Shallow files come
 * first when the limits cut the list; installed dependencies are never sent.
 */
async function siblingFiles(projectId: string, entryId: string, branch: string) {
  const rows = await prisma.file.findMany({
    where: { projectId, branch, id: { not: entryId }, type: { not: "board" }, deletedAt: null },
    select: { path: true, yjsState: true },
  });
  const candidates = rows
    .filter((row) => !row.path.split("/").includes("node_modules"))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));

  const files: { path: string; content: string }[] = [];
  let bytes = 0;
  for (const row of candidates) {
    const content = yjsStateToText(row.yjsState);
    const size = Buffer.byteLength(content);
    if (files.length >= MAX_RUN_FILES || bytes + size > MAX_RUN_FILES_BYTES) continue;
    files.push({ path: row.path, content });
    bytes += size;
  }
  return files;
}

export async function requestRun(
  userId: string,
  projectId: string,
  fileId: string,
  code: string,
  enqueue: (job: RunJob) => Promise<void> = enqueueRun,
) {
  await requireProjectRole(projectId, userId, "editor");

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId || file.deletedAt) {
    throw new AppError("Файл не найден", 404);
  }
  if (file.type !== "code") {
    throw new AppError("Запускать можно только файлы с кодом", 400);
  }

  const language = toRunnableLanguage(file.language ?? inferLanguage(file.path));
  if (!language) {
    throw new AppError("Запускать можно только файлы JavaScript и Python", 400);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true },
  });

  const runId = randomUUID();
  await enqueue({
    runId,
    projectId,
    fileId,
    language,
    code,
    entry: file.path,
    files: await siblingFiles(projectId, fileId, file.branch),
    startedBy: { id: user.id, name: user.name },
  });

  return { runId };
}
