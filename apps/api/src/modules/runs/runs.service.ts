import { randomUUID } from "node:crypto";
import { prisma } from "@collab/db";
import { inferLanguage, toRunnableLanguage } from "@collab/shared";
import type { RunJob } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { enqueueRun } from "../../lib/queue.js";

export async function requestRun(
  userId: string,
  projectId: string,
  fileId: string,
  code: string,
  enqueue: (job: RunJob) => Promise<void> = enqueueRun,
) {
  await requireProjectRole(projectId, userId, "editor");

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId) {
    throw new AppError("File not found", 404);
  }
  if (file.type !== "code") {
    throw new AppError("Only code files can be run", 400);
  }

  const language = toRunnableLanguage(file.language ?? inferLanguage(file.path));
  if (!language) {
    throw new AppError("Only JavaScript and Python files can be run", 400);
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
    startedBy: { id: user.id, name: user.name },
  });

  return { runId };
}
