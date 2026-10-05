import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { CLOSE_ACCESS_REVOKED } from "@collab/shared";
import { buildApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { hub } from "../../lib/hub.js";
import { createProject, removeMember } from "../projects/projects.service.js";
import { createMessage } from "../messages/messages.service.js";
import { CLOSE_FORBIDDEN, CLOSE_UNAUTHORIZED } from "./realtime.routes.js";

type App = Awaited<ReturnType<typeof buildApp>>;

function closeCode(url: string): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.once("close", (code) => resolve(code));
  });
}

interface WsEvent {
  type: string;
  users: { id: string }[];
  message: { body: string; projectId: string };
}

function nextEvent(ws: WebSocket, type: string, accept: (event: WsEvent) => boolean = () => true) {
  return new Promise<WsEvent>((resolve) => {
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as WsEvent;
      if (event.type === type && accept(event)) {
        ws.off("message", onMessage);
        resolve(event);
      }
    };
    ws.on("message", onMessage);
  });
}

/** Resolves once the server has registered the connection (it announces presence right away). */
function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onMessage = (data: WebSocket.RawData) => {
      if ((JSON.parse(data.toString()) as WsEvent).type === "presence.updated") {
        ws.off("message", onMessage);
        resolve(ws);
      }
    };
    ws.on("message", onMessage);
    ws.once("error", reject);
  });
}

describe("GET /ws", () => {
  let app: App;
  let base: string;
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user() {
    const u = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "WS User", passwordHash: "x" },
    });
    userIds.push(u.id);
    return { ...u, token: signAccessToken({ sub: u.id, email: u.email }) };
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("pushes a new chat message to a connected project member", async () => {
    const owner = await user();
    const p = await createProject(owner.id, { name: "ws project" });
    projectIds.push(p.id);

    const ws = await connect(`${base}?projectId=${p.id}&token=${owner.token}`);
    const received = nextEvent(ws, "message.created");
    await createMessage(owner.id, p.id, { body: "over the wire" });

    expect(await received).toMatchObject({
      type: "message.created",
      message: { body: "over the wire", projectId: p.id },
    });
    ws.close();
  });

  it("tells everyone who is online and updates when somebody leaves", async () => {
    const owner = await user();
    const joiner = await user();
    const p = await createProject(owner.id, { name: "presence project" });
    projectIds.push(p.id);
    await prisma.projectMember.create({ data: { projectId: p.id, userId: joiner.id, role: "editor" } });

    const first = await connect(`${base}?projectId=${p.id}&token=${owner.token}`);
    const bothOnline = nextEvent(first, "presence.updated", (e) => e.users.length === 2);
    const second = await connect(`${base}?projectId=${p.id}&token=${joiner.token}`);

    const event = await bothOnline;
    expect(event.users.map((u) => u.id).sort()).toEqual([owner.id, joiner.id].sort());

    const onlyOwner = nextEvent(first, "presence.updated", (e) => e.users.length === 1);
    second.close();
    expect((await onlyOwner).users[0].id).toBe(owner.id);
    first.close();
  });

  it("counts a user once even with several tabs open", async () => {
    const owner = await user();
    const p = await createProject(owner.id, { name: "two tabs" });
    projectIds.push(p.id);

    const tabA = await connect(`${base}?projectId=${p.id}&token=${owner.token}`);
    const tabB = await connect(`${base}?projectId=${p.id}&token=${owner.token}`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(hub.presence(p.id)).toHaveLength(1);
    tabA.close();
    tabB.close();
  });

  it("closes a removed member's open connection at once and keeps everybody else's", async () => {
    const owner = await user();
    const member = await user();
    const p = await createProject(owner.id, { name: "removal project" });
    projectIds.push(p.id);
    await prisma.projectMember.create({ data: { projectId: p.id, userId: member.id, role: "editor" } });

    const ownerWs = await connect(`${base}?projectId=${p.id}&token=${owner.token}`);
    const memberWs = await connect(`${base}?projectId=${p.id}&token=${member.token}`);
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      memberWs.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    const membersChanged = nextEvent(ownerWs, "project.members");

    await removeMember(owner.id, p.id, member.id);

    expect(await closed).toEqual({ code: CLOSE_ACCESS_REVOKED, reason: "removed" });
    await membersChanged;
    expect(ownerWs.readyState).toBe(WebSocket.OPEN);
    expect(hub.presence(p.id).map((u) => u.id)).toEqual([owner.id]);
    ownerWs.close();
  });

  it("rejects a bad token", async () => {
    const owner = await user();
    const p = await createProject(owner.id, { name: "ws project" });
    projectIds.push(p.id);

    expect(await closeCode(`${base}?projectId=${p.id}&token=garbage`)).toBe(CLOSE_UNAUTHORIZED);
  });

  it("rejects a user who is not a project member", async () => {
    const owner = await user();
    const stranger = await user();
    const p = await createProject(owner.id, { name: "ws project" });
    projectIds.push(p.id);

    expect(await closeCode(`${base}?projectId=${p.id}&token=${stranger.token}`)).toBe(
      CLOSE_FORBIDDEN,
    );
  });
});
