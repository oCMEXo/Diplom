import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { buildApp } from "../../app.js";
import { signAccessToken, verifyAccessToken } from "../../lib/jwt.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { createFile, deleteFile } from "../files/files.service.js";
import { getVersion, listVersions, restoreVersion } from "./versions.service.js";

/** Stands in for the sync server: remembers who asked to restore what, and answers with `status`. */
function fakeCollab(status = 204) {
  const calls: { path: string; userId: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const token = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "");
    calls.push({ path: new URL(String(input)).pathname, userId: verifyAccessToken(token).sub });
    return new Response(status === 204 ? null : JSON.stringify({ message: "x" }), { status });
  };
  return { calls, fetchImpl };
}

const unreachable: typeof fetch = async () => {
  throw new TypeError("fetch failed");
};

describe("versions.service", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user(name = "Test User") {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name, passwordHash: "not-a-real-hash" },
    });
    userIds.push(created.id);
    return created;
  }

  /** A project with a viewer and a file that has two versions (the newer one by the owner). */
  async function fileWithHistory() {
    const owner = await user("Анна");
    const viewer = await user("Наблюдатель");
    const project = await createProject(owner.id, { name: "Versions test project" });
    projectIds.push(project.id);
    await inviteMember(owner.id, project.id, { email: viewer.email, role: "viewer" });
    const file = await createFile(owner.id, project.id, { path: "main.py", type: "code" });
    const older = await prisma.fileVersion.create({
      data: { fileId: file.id, content: "print(1)", size: 8, createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    const newer = await prisma.fileVersion.create({
      data: { fileId: file.id, content: "print(2)", size: 8, authorId: owner.id },
    });
    return { owner, viewer, project, file, older, newer };
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("lists versions newest first with the author's name, to a viewer too", async () => {
    const { viewer, project, file, older, newer } = await fileWithHistory();

    const versions = await listVersions(viewer.id, project.id, file.id);

    expect(versions).toEqual([
      { id: newer.id, createdAt: newer.createdAt.toISOString(), size: 8, authorName: "Анна" },
      { id: older.id, createdAt: older.createdAt.toISOString(), size: 8, authorName: null },
    ]);
  });

  it("returns the text of a version, but not of another file's version", async () => {
    const { viewer, owner, project, file, older } = await fileWithHistory();
    const other = await createFile(owner.id, project.id, { path: "other.py", type: "code" });

    const version = await getVersion(viewer.id, project.id, file.id, older.id);
    expect(version.content).toBe("print(1)");

    await expect(getVersion(viewer.id, project.id, other.id, older.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hides a file's history from people outside the project", async () => {
    const { project, file, older } = await fileWithHistory();
    const stranger = await user();
    const collab = fakeCollab();

    await expect(listVersions(stranger.id, project.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getVersion(stranger.id, project.id, file.id, older.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(restoreVersion(stranger.id, project.id, file.id, older.id, collab.fetchImpl)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(collab.calls).toHaveLength(0);
  });

  it("does not let a viewer restore a version", async () => {
    const { viewer, project, file, older } = await fileWithHistory();
    const collab = fakeCollab();

    await expect(restoreVersion(viewer.id, project.id, file.id, older.id, collab.fetchImpl)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(collab.calls).toHaveLength(0);
  });

  it("restores through the sync server on behalf of the person who asked", async () => {
    const { owner, project, file, older } = await fileWithHistory();
    const collab = fakeCollab();

    await restoreVersion(owner.id, project.id, file.id, older.id, collab.fetchImpl);

    expect(collab.calls).toEqual([{ path: `/files/${file.id}/versions/${older.id}/restore`, userId: owner.id }]);
  });

  it("does not restore into a file in the trash or an unknown version", async () => {
    const { owner, project, file, older } = await fileWithHistory();
    const collab = fakeCollab();

    await expect(restoreVersion(owner.id, project.id, file.id, randomUUID(), collab.fetchImpl)).rejects.toMatchObject({
      statusCode: 404,
    });
    await deleteFile(owner.id, project.id, file.id);
    await expect(restoreVersion(owner.id, project.id, file.id, older.id, collab.fetchImpl)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(collab.calls).toHaveLength(0);
  });

  it("explains when the sync server is down or fails", async () => {
    const { owner, project, file, older } = await fileWithHistory();

    await expect(restoreVersion(owner.id, project.id, file.id, older.id, unreachable)).rejects.toMatchObject({
      statusCode: 503,
      message: "Сервер совместного редактирования недоступен — попробуйте позже",
    });
    await expect(
      restoreVersion(owner.id, project.id, file.id, older.id, fakeCollab(500).fetchImpl),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("serves the history over HTTP", async () => {
    const { viewer, project, file, newer } = await fileWithHistory();
    const app = await buildApp();
    try {
      const headers = { authorization: `Bearer ${signAccessToken({ sub: viewer.id, email: viewer.email })}` };
      const base = `/projects/${project.id}/files/${file.id}/versions`;

      const list = await app.inject({ method: "GET", url: base, headers });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toHaveLength(2);

      const one = await app.inject({ method: "GET", url: `${base}/${newer.id}`, headers });
      expect(one.json()).toMatchObject({ content: "print(2)", authorName: "Анна" });

      const restore = await app.inject({ method: "POST", url: `${base}/${newer.id}/restore`, headers });
      expect(restore.statusCode).toBe(403);
      expect(restore.json().message).toBe("Для этого действия не хватает прав в проекте");
    } finally {
      await app.close();
    }
  });
});
