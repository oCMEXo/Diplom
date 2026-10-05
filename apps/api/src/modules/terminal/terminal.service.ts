import { randomBytes } from "node:crypto";
import { prisma } from "@collab/db";
import type { TerminalTicket, TerminalTicketData } from "@collab/shared";
import { requireProjectRole } from "../../lib/authorization.js";
import { activeBranch } from "../../lib/branch.js";
import { storeTerminalTicket } from "../../lib/terminal-tickets.js";
import { projectTextFiles } from "../runs/runs.service.js";

/**
 * Prepares a terminal for the project: the runner gets the files of the active branch as they are
 * now, through a ticket that only the browser asking for it knows.
 */
export async function openTerminal(
  userId: string,
  projectId: string,
  store: (ticket: string, data: TerminalTicketData) => Promise<void> = storeTerminalTicket,
): Promise<TerminalTicket> {
  await requireProjectRole(projectId, userId, "editor");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  const files = await projectTextFiles(projectId, await activeBranch(projectId));

  const ticket = randomBytes(24).toString("base64url");
  await store(ticket, { userId, userName: user.name, projectId, files });
  return { ticket };
}
