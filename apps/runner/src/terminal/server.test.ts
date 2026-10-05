import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { TerminalServerMessage, TerminalTicketData } from "@collab/shared";
import { createTerminalServer } from "./server.js";
import type { TerminalSessionOptions } from "./session.js";

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

/** A session that echoes what it gets, so the protocol can be checked without Docker. */
function fakeSessions() {
  const opened: { options: TerminalSessionOptions; written: string[]; sizes: [number, number][]; closed: boolean }[] = [];
  const openSession = async (options: TerminalSessionOptions) => {
    const record = { options, written: [] as string[], sizes: [] as [number, number][], closed: false };
    opened.push(record);
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      write: (data: string) => {
        record.written.push(data);
        options.onOutput(`echo:${data}`);
      },
      resize: (cols: number, rows: number) => record.sizes.push([cols, rows]),
      close: () => {
        record.closed = true;
      },
    };
  };
  return { opened, openSession };
}

describe("terminal server", () => {
  const servers: ReturnType<typeof createTerminalServer>[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  async function start(tickets: Record<string, TerminalTicketData>, sessions = fakeSessions(), maxPerUser = 2) {
    const server = createTerminalServer({
      takeTicket: async (ticket) => {
        const data = tickets[ticket] ?? null;
        delete tickets[ticket];
        return data;
      },
      openSession: sessions.openSession,
      maxMs: 60_000,
      maxPerUser,
      maxTotal: 10,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return { sessions, url: (query: string) => `ws://127.0.0.1:${port}/?${query}` };
  }

  function connect(url: string) {
    const socket = new WebSocket(url);
    const messages: TerminalServerMessage[] = [];
    socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
    const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
    const until = async (check: (all: TerminalServerMessage[]) => boolean) => {
      const deadline = Date.now() + 3000;
      while (!check(messages)) {
        if (Date.now() > deadline) throw new Error(`timed out: ${JSON.stringify(messages)}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    return { socket, messages, closed, until };
  }

  const ticketData = (): TerminalTicketData => ({
    userId: USER,
    userName: "Аня",
    projectId: PROJECT,
    files: [{ path: "main.js", content: "1" }],
  });

  it("turns away a missing or used ticket with an explanation", async () => {
    const { url } = await start({});
    const client = connect(url("ticket=nope"));
    await client.closed;
    expect(client.messages).toEqual([
      { type: "exit", message: "Ссылка на терминал устарела. Откройте терминал заново." },
    ]);
  });

  it("starts a session with the ticket's files and the window size, then relays both ways", async () => {
    const { url, sessions } = await start({ t1: ticketData() });
    const client = connect(url("ticket=t1&cols=120&rows=40"));
    await new Promise((resolve) => client.socket.on("open", resolve));
    // Typed before the shell is ready: must not be lost.
    client.socket.send(JSON.stringify({ type: "input", data: "ls\r" }));
    await client.until((all) => all.some((m) => m.type === "ready"));

    const session = sessions.opened[0]!;
    expect(session.options).toMatchObject({ userName: "Аня", cols: 120, rows: 40, files: [{ path: "main.js", content: "1" }] });
    await client.until((all) => all.some((m) => m.type === "output" && m.data === "echo:ls\r"));

    client.socket.send(JSON.stringify({ type: "resize", cols: 90, rows: 30 }));
    client.socket.send("not json");
    client.socket.send(JSON.stringify({ type: "resize", cols: 99999, rows: 1 }));
    client.socket.send(JSON.stringify({ type: "input", data: "pwd\r" }));
    await client.until((all) => all.some((m) => m.type === "output" && m.data === "echo:pwd\r"));
    expect(session.sizes).toEqual([[90, 30]]);
    expect(client.messages[0]).toEqual({ type: "status", message: "Запускаем песочницу…" });

    client.socket.close();
    await client.closed;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(session.closed).toBe(true);
  });

  it("tells the browser when the shell ends", async () => {
    const sessions = fakeSessions();
    const { url } = await start({ t1: ticketData() }, sessions);
    const client = connect(url("ticket=t1"));
    await client.until((all) => all.some((m) => m.type === "ready"));
    sessions.opened[0]!.options.onExit("Командная строка закрыта (exit).");
    await client.closed;
    expect(client.messages.at(-1)).toEqual({ type: "exit", message: "Командная строка закрыта (exit)." });
  });

  it("limits how many terminals one person keeps open", async () => {
    const { url } = await start({ a: ticketData(), b: ticketData() }, fakeSessions(), 1);
    const first = connect(url("ticket=a"));
    await first.until((all) => all.some((m) => m.type === "ready"));
    const second = connect(url("ticket=b"));
    await second.closed;
    expect(second.messages.at(-1)?.type).toBe("exit");
    expect(second.messages.at(-1)).toMatchObject({ message: expect.stringContaining("слишком много") });
    first.socket.close();
  });

  it("explains when the sandbox cannot start", async () => {
    const server = await start({ t1: ticketData() }, {
      opened: [],
      openSession: async () => {
        throw new Error("docker is down");
      },
    });
    const client = connect(server.url("ticket=t1"));
    await client.closed;
    expect(client.messages.at(-1)).toMatchObject({ type: "exit", message: expect.stringContaining("Docker") });
  });
});
