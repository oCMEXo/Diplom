import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { terminalClientMessageSchema } from "@collab/shared";
import type { TerminalServerMessage, TerminalTicketData } from "@collab/shared";
import type { TerminalSession, TerminalSessionOptions } from "./session.js";

export interface TerminalServerOptions {
  /** Returns the ticket's data and forgets it (a ticket works once), or null. */
  takeTicket: (ticket: string) => Promise<TerminalTicketData | null>;
  openSession: (options: TerminalSessionOptions) => Promise<TerminalSession>;
  maxMs: number;
  maxPerUser: number;
  maxTotal: number;
  /** How often to check that the browser is still there. */
  heartbeatMs?: number;
}

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/**
 * The browser's end of the terminal: `ws://…/?ticket=…&cols=…&rows=…`. Keystrokes go to the shell,
 * the shell's output comes back; closing the tab ends the session and removes the container.
 */
export function createTerminalServer(options: TerminalServerOptions) {
  const server = http.createServer((_request, response) => {
    response.writeHead(426, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Терминал работает через WebSocket.");
  });
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
  const perUser = new Map<string, number>();
  let total = 0;

  wss.on("connection", async (socket: WebSocket & { alive?: boolean }, request) => {
    const send = (message: TerminalServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const end = (message: string) => {
      send({ type: "exit", message });
      socket.close(1000);
    };
    socket.alive = true;
    socket.on("pong", () => (socket.alive = true));

    const url = new URL(request.url ?? "/", "http://terminal");
    const ticket = url.searchParams.get("ticket") ?? "";
    const data = ticket ? await options.takeTicket(ticket).catch(() => null) : null;
    if (!data) return end("Ссылка на терминал устарела. Откройте терминал заново.");
    if ((perUser.get(data.userId) ?? 0) >= options.maxPerUser) {
      return end(`Открыто слишком много терминалов (не больше ${options.maxPerUser}). Закройте лишние вкладки.`);
    }
    if (total >= options.maxTotal) return end("Сервер сейчас занят другими терминалами. Попробуйте через минуту.");

    perUser.set(data.userId, (perUser.get(data.userId) ?? 0) + 1);
    total += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      total -= 1;
      const left = (perUser.get(data.userId) ?? 1) - 1;
      if (left > 0) perUser.set(data.userId, left);
      else perUser.delete(data.userId);
    };

    // Keystrokes typed while the container starts are kept and sent once the shell is there.
    const early: string[] = [];
    let session: TerminalSession | null = null;
    let gone = false;
    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const message = terminalClientMessageSchema.safeParse(parsed);
      if (!message.success) return;
      if (message.data.type === "input") {
        if (session) session.write(message.data.data);
        else early.push(message.data.data);
      } else {
        session?.resize(message.data.cols, message.data.rows);
      }
    });
    socket.on("close", () => {
      gone = true;
      session?.close();
      release();
    });

    send({ type: "status", message: "Запускаем песочницу…" });
    try {
      const opened = await options.openSession({
        files: data.files,
        userName: data.userName,
        cols: clamp(Number(url.searchParams.get("cols")), 2, 500, 80),
        rows: clamp(Number(url.searchParams.get("rows")), 2, 300, 24),
        maxMs: options.maxMs,
        onOutput: (chunk) => send({ type: "output", data: chunk }),
        onExit: (message) => end(message),
      });
      if (gone) return opened.close();
      session = opened;
      send({ type: "ready" });
      for (const input of early.splice(0)) opened.write(input);
    } catch (error) {
      console.error("terminal failed to start:", error instanceof Error ? error.message : error);
      release();
      end("Не удалось запустить песочницу. Проверьте, что Docker работает, и попробуйте ещё раз.");
    }
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();

  server.on("close", () => {
    clearInterval(heartbeat);
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  });
  return server;
}
