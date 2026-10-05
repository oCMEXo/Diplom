import { z } from "zod";

/**
 * The terminal is a live shell in a sandbox container. The API checks who may open it and leaves a
 * one-time ticket (with the project's files) in Redis; the runner, which alone talks to Docker,
 * takes the ticket when the browser connects to it over a WebSocket.
 */
export const TERMINAL_TICKET_PREFIX = "terminal:ticket:";
export const TERMINAL_TICKET_TTL_SECONDS = 60;
export const TERMINAL_MAX_MINUTES = 30;
/** Where the project's files are copied inside the terminal container. */
export const TERMINAL_WORKDIR = "/project";

export const terminalTicketSchema = z.object({ ticket: z.string() });
export type TerminalTicket = z.infer<typeof terminalTicketSchema>;

export const terminalTicketDataSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string(),
  projectId: z.string().uuid(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});
export type TerminalTicketData = z.infer<typeof terminalTicketDataSchema>;

/** Browser → runner. */
export const terminalClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("input"), data: z.string().max(16_384) }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(300),
  }),
]);
export type TerminalClientMessage = z.infer<typeof terminalClientMessageSchema>;

/** Runner → browser. */
export const terminalServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string() }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("output"), data: z.string() }),
  z.object({ type: z.literal("exit"), message: z.string() }),
]);
export type TerminalServerMessage = z.infer<typeof terminalServerMessageSchema>;

/**
 * Whether this server runs people's code: "open" for everyone, "code" only after entering the access
 * code (the public test host), "off" not at all.
 */
export const runModeSchema = z.enum(["open", "code", "off"]);
export type RunMode = z.infer<typeof runModeSchema>;

export const featuresSchema = z.object({ run: runModeSchema });
export type Features = z.infer<typeof featuresSchema>;

export const runAccessSchema = z.object({ code: z.string().trim().min(1).max(200) });

/** Requests that run code carry the access code in this header. */
export const RUN_CODE_HEADER = "x-run-code";
