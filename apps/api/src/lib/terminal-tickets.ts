import { Redis } from "ioredis";
import { TERMINAL_TICKET_PREFIX, TERMINAL_TICKET_TTL_SECONDS } from "@collab/shared";
import type { TerminalTicketData } from "@collab/shared";
import { env } from "../env.js";

let connection: Redis | null = null;

/** Leaves a one-time ticket for the runner; it expires if the browser never connects. */
export async function storeTerminalTicket(ticket: string, data: TerminalTicketData) {
  connection ??= new Redis(env.REDIS_URL);
  await connection.set(`${TERMINAL_TICKET_PREFIX}${ticket}`, JSON.stringify(data), "EX", TERMINAL_TICKET_TTL_SECONDS);
}

export async function closeTerminalTickets() {
  connection?.disconnect();
  connection = null;
}
