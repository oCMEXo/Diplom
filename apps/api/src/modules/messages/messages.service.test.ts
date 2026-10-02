import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { hub } from "../../lib/hub.js";
import { createProject, joinViaInvite } from "../projects/projects.service.js";
import { createMessage, listMessages } from "./messages.service.js";

describe("messages.service", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user(name = "Test User") {
    const u = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name, passwordHash: "x" },
    });
    userIds.push(u.id);
    return u;
  }

  async function project(ownerId: string) {
    const p = await createProject(ownerId, { name: "Chat project" });
    projectIds.push(p.id);
    return p;
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("stores a message and returns it with its author", async () => {
    const owner = await user("Анна");
    const p = await project(owner.id);

    const message = await createMessage(owner.id, p.id, { body: "привет" });
    expect(message.body).toBe("привет");
    expect(message.author).toEqual({ id: owner.id, name: "Анна", isGuest: false });
  });

  it("lists messages oldest-first", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await createMessage(owner.id, p.id, { body: "one" });
    await createMessage(owner.id, p.id, { body: "two" });

    const list = await listMessages(owner.id, p.id, { limit: 50 });
    expect(list.map((m) => m.body)).toEqual(["one", "two"]);
  });

  it("pages backwards with the `before` cursor", async () => {
    const owner = await user();
    const p = await project(owner.id);
    for (const body of ["m1", "m2", "m3", "m4"]) {
      await createMessage(owner.id, p.id, { body });
    }

    const latest = await listMessages(owner.id, p.id, { limit: 2 });
    expect(latest.map((m) => m.body)).toEqual(["m3", "m4"]);

    const older = await listMessages(owner.id, p.id, { limit: 2, before: latest[0]!.id });
    expect(older.map((m) => m.body)).toEqual(["m1", "m2"]);
  });

  it("lets a read-only viewer chat", async () => {
    const owner = await user();
    const viewer = await user();
    const p = await project(owner.id);
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: viewer.id, role: "viewer" },
    });

    await expect(createMessage(viewer.id, p.id, { body: "hi" })).resolves.toMatchObject({
      body: "hi",
    });
  });

  it("hides the chat from non-members", async () => {
    const owner = await user();
    const stranger = await user();
    const p = await project(owner.id);

    await expect(listMessages(stranger.id, p.id, { limit: 50 })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(createMessage(stranger.id, p.id, { body: "x" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects a cursor that belongs to another project", async () => {
    const owner = await user();
    const p1 = await project(owner.id);
    const p2 = await project(owner.id);
    const foreign = await createMessage(owner.id, p2.id, { body: "other" });

    await expect(
      listMessages(owner.id, p1.id, { limit: 10, before: foreign.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("broadcasts new messages to that project's subscribers only", async () => {
    const owner = await user();
    const joiner = await user();
    const p = await project(owner.id);
    const other = await project(owner.id);
    await joinViaInvite(joiner.id, p.inviteCode);

    const received: string[] = [];
    const unsubscribe = hub.subscribe(p.id, { send: (data) => received.push(data) });
    const unsubscribeOther = hub.subscribe(other.id, { send: (data) => received.push(`other:${data}`) });

    await createMessage(joiner.id, p.id, { body: "live" });
    unsubscribe();
    unsubscribeOther();

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!)).toMatchObject({
      type: "message.created",
      message: { body: "live" },
    });
  });
});
