import { prisma } from "@collab/db";
import type { CreateMessageInput, Message } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { hub } from "../../lib/hub.js";

interface MessageRow {
  id: string;
  projectId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; isGuest: boolean };
}

function toMessageDto(row: MessageRow): Message {
  return {
    id: row.id,
    projectId: row.projectId,
    author: { id: row.author.id, name: row.author.name, isGuest: row.author.isGuest },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

const authorSelect = { select: { id: true, name: true, isGuest: true } } as const;

export async function listMessages(
  userId: string,
  projectId: string,
  options: { before?: string; limit: number },
) {
  await requireProjectRole(projectId, userId, "viewer");

  let createdBefore: Date | undefined;
  if (options.before) {
    const cursor = await prisma.message.findUnique({ where: { id: options.before } });
    if (!cursor || cursor.projectId !== projectId) {
      throw new AppError("Сообщение не найдено", 404);
    }
    createdBefore = cursor.createdAt;
  }

  const rows = await prisma.message.findMany({
    where: { projectId, ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit,
    include: { author: authorSelect },
  });

  return rows.reverse().map(toMessageDto);
}

export async function createMessage(userId: string, projectId: string, input: CreateMessageInput) {
  await requireProjectRole(projectId, userId, "viewer");

  const row = await prisma.message.create({
    data: { projectId, authorId: userId, body: input.body },
    include: { author: authorSelect },
  });

  const message = toMessageDto(row);
  hub.broadcast(projectId, { type: "message.created", message });
  return message;
}
