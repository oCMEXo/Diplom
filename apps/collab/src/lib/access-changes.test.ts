import { randomUUID } from "node:crypto";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Hocuspocus } from "@hocuspocus/server";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { ACCESS_CHANGES_CHANNEL, type AccessChange } from "@collab/shared";
import { env } from "../env.js";
import { createHocuspocus } from "../hocuspocus.js";
import { startAccessChangeListener } from "./access-changes.js";

function signToken(userId: string) {
  return jwt.sign({ sub: userId, email: "x@test.local" }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: "1h",
  });
}

function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        reject(new Error("timed out"));
      }
    }, 20);
  });
}

describe("access changes from the API", () => {
  let server: Hocuspocus;
  let url: string;
  let stopListener: () => Promise<void>;
  let publisher: Redis;
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const providers: { provider: HocuspocusProvider; socket: HocuspocusProviderWebsocket }[] = [];

  beforeAll(async () => {
    server = createHocuspocus({ port: 0, address: "127.0.0.1", quiet: true, stopOnSignals: false });
    await server.listen();
    url = `ws://127.0.0.1:${server.address.port}`;
    stopListener = await startAccessChangeListener(env.REDIS_URL, server);
    publisher = new Redis(env.REDIS_URL);
  });

  afterEach(() => {
    for (const { provider, socket } of providers.splice(0)) {
      provider.destroy();
      socket.destroy();
    }
  });

  afterAll(async () => {
    await stopListener();
    publisher.disconnect();
    await server.destroy();
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function user() {
    const u = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Test", passwordHash: "x" },
    });
    userIds.push(u.id);
    return u.id;
  }

  /** A project of `ownerId` with two files; `editors` are added as editors. */
  async function project(ownerId: string, editors: string[] = []) {
    const p = await prisma.project.create({
      data: {
        name: "access change project",
        ownerId,
        inviteCode: randomUUID(),
        members: {
          create: [{ userId: ownerId, role: "owner" }, ...editors.map((userId) => ({ userId, role: "editor" as const }))],
        },
      },
    });
    projectIds.push(p.id);
    const files = await Promise.all(
      ["main.py", "util.py"].map((path) =>
        prisma.file.create({ data: { projectId: p.id, path, type: "code", language: "python" } }),
      ),
    );
    return { id: p.id, files: files.map((f) => f.id) };
  }

  function connectionsOf(fileId: string, userId: string) {
    const document = server.documents.get(fileId);
    return (document?.getConnections() ?? []).filter((c) => c.context.userId === userId);
  }

  /** Opens a file the way the web app does (one socket per document) and waits until the server has it. */
  async function open(fileId: string, userId: string) {
    const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: fileId,
      token: signToken(userId),
      document: new Y.Doc(),
    });
    providers.push({ provider, socket });
    await waitFor(() => connectionsOf(fileId, userId).length === 1);
  }

  const publish = (change: AccessChange | string) =>
    publisher.publish(ACCESS_CHANGES_CHANNEL, typeof change === "string" ? change : JSON.stringify(change));

  it("closes only the removed member's connections, and only to that project's documents", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner, [member]);
    const other = await project(owner, [member]);
    await open(p.files[0]!, member);
    await open(p.files[1]!, member);
    await open(other.files[0]!, member);
    await open(p.files[0]!, owner);

    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: p.id, userId: member } } });
    await publish({ projectId: p.id, userId: member, reason: "removed" });

    await waitFor(() => connectionsOf(p.files[0]!, member).length + connectionsOf(p.files[1]!, member).length === 0);
    expect(connectionsOf(other.files[0]!, member)).toHaveLength(1);
    expect(connectionsOf(p.files[0]!, owner)).toHaveLength(1);

    // The removed member's editor does not come back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(connectionsOf(p.files[0]!, member)).toHaveLength(0);
  });

  it("reconnects a member demoted to viewer as read-only", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner, [member]);
    await open(p.files[0]!, member);
    expect(connectionsOf(p.files[0]!, member)[0]?.readOnly).toBe(false);

    await prisma.projectMember.update({
      where: { projectId_userId: { projectId: p.id, userId: member } },
      data: { role: "viewer" },
    });
    await publish({ projectId: p.id, userId: member, reason: "role" });

    await waitFor(() => connectionsOf(p.files[0]!, member)[0]?.readOnly === true);
    expect(connectionsOf(p.files[0]!, member)).toHaveLength(1);
  });

  it("closes everybody's connections to a deleted project and ignores malformed messages", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner, [member]);
    const other = await project(owner);
    await open(p.files[0]!, owner);
    await open(p.files[0]!, member);
    await open(other.files[0]!, owner);

    await publish("not json");
    await publish(JSON.stringify({ projectId: other.id, reason: "who knows" }));
    await publish({ projectId: p.id, reason: "deleted" });

    await waitFor(() => (server.documents.get(p.files[0]!)?.getConnectionsCount() ?? 0) === 0);
    expect(connectionsOf(other.files[0]!, owner)).toHaveLength(1);
  });
});
