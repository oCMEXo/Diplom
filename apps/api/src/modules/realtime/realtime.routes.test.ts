import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { buildApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { createProject } from "../projects/projects.service.js";
import { createMessage } from "../messages/messages.service.js";
import { CLOSE_FORBIDDEN, CLOSE_UNAUTHORIZED } from "./realtime.routes.js";

type App = Awaited<ReturnType<typeof buildApp>>;

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function closeCode(url: string): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.once("close", (code) => resolve(code));
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
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

    const ws = await open(`${base}?projectId=${p.id}&token=${owner.token}`);
    const received = nextMessage(ws);
    await createMessage(owner.id, p.id, { body: "over the wire" });

    expect(await received).toMatchObject({
      type: "message.created",
      message: { body: "over the wire", projectId: p.id },
    });
    ws.close();
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
