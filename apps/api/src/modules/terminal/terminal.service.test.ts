import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import type { TerminalTicketData } from "@collab/shared";
import { textToYjsState } from "../../lib/yjs-text.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { openTerminal } from "./terminal.service.js";

describe("terminal tickets", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user(name = "Терминальщик") {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name, passwordHash: "x" },
    });
    userIds.push(created.id);
    return created;
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("hands the runner the text files of the active branch through an unguessable one-time ticket", async () => {
    const owner = await user("Аня");
    const project = await createProject(owner.id, { name: "Терминал" });
    projectIds.push(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { githubOwner: "o", githubRepo: "r", githubBranch: "dev" } });
    const file = (path: string, content: string, extra: object = {}) =>
      prisma.file.create({
        data: { projectId: project.id, path, type: "code", branch: "dev", yjsState: Buffer.from(textToYjsState(content)), ...extra },
      });
    await file("main.js", "require('./lib/log')");
    await file("lib/log.js", "module.exports = 1");
    await file("old.js", "gone", { deletedAt: new Date(), path: ".trash/x/old.js" });
    await file("other-branch.js", "not here", { branch: "main" });
    await prisma.file.create({ data: { projectId: project.id, path: "board", type: "board", branch: "dev" } });

    const stored: { ticket: string; data: TerminalTicketData }[] = [];
    const first = await openTerminal(owner.id, project.id, async (ticket, data) => {
      stored.push({ ticket, data });
    });
    const second = await openTerminal(owner.id, project.id, async (ticket, data) => {
      stored.push({ ticket, data });
    });

    expect(first.ticket).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second.ticket).not.toBe(first.ticket);
    expect(stored[0]!.ticket).toBe(first.ticket);
    expect(stored[0]!.data).toMatchObject({ userId: owner.id, userName: "Аня", projectId: project.id });
    expect(stored[0]!.data.files).toEqual([
      { path: "main.js", content: "require('./lib/log')" },
      { path: "lib/log.js", content: "module.exports = 1" },
    ]);
  });

  it("is only for people who may change the project", async () => {
    const owner = await user();
    const viewer = await user();
    const stranger = await user();
    const project = await createProject(owner.id, { name: "Только смотреть" });
    projectIds.push(project.id);
    await inviteMember(owner.id, project.id, { email: viewer.email, role: "viewer" });
    const store = async () => undefined;

    await expect(openTerminal(viewer.id, project.id, store)).rejects.toMatchObject({ statusCode: 403 });
    await expect(openTerminal(stranger.id, project.id, store)).rejects.toMatchObject({ statusCode: 404 });
  });
});
