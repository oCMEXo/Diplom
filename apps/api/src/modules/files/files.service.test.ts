import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { env } from "../../env.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import {
  createFile,
  deleteFile,
  getFile,
  listFiles,
  listTrash,
  purgeExpiredTrash,
  purgeFile,
  restoreFile,
  updateFile,
} from "./files.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: `${randomUUID()}@test.local`,
      name: "Test User",
      passwordHash: "not-a-real-hash",
    },
  });
}

describe("files.service", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function user() {
    const u = await createTestUser();
    createdUserIds.push(u.id);
    return u;
  }

  async function project(ownerId: string) {
    const p = await createProject(ownerId, { name: "Files test project" });
    createdProjectIds.push(p.id);
    return p;
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("creates and lists files for a project member", async () => {
    const owner = await user();
    const p = await project(owner.id);

    const file = await createFile(owner.id, p.id, { path: "main.py", type: "code" });
    expect(file.path).toBe("main.py");

    const files = await listFiles(owner.id, p.id);
    expect(files.map((f) => f.id)).toContain(file.id);
  });

  it("rejects a duplicate path in the same project", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await createFile(owner.id, p.id, { path: "main.py", type: "code" });

    await expect(createFile(owner.id, p.id, { path: "main.py", type: "code" })).rejects.toMatchObject(
      { statusCode: 409 },
    );
  });

  it("lets a viewer read but not create files", async () => {
    const owner = await user();
    const viewer = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: viewer.email, role: "viewer" });
    const file = await createFile(owner.id, p.id, { path: "README.md", type: "doc" });

    const fetched = await getFile(viewer.id, p.id, file.id);
    expect(fetched.id).toBe(file.id);

    await expect(
      createFile(viewer.id, p.id, { path: "other.py", type: "code" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("hides files from non-members (404)", async () => {
    const owner = await user();
    const stranger = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "main.py", type: "code" });

    await expect(getFile(stranger.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("renames a file via update", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "old.py", type: "code" });

    const updated = await updateFile(owner.id, p.id, file.id, { path: "new.py" });
    expect(updated.path).toBe("new.py");
  });

  it("updates the language when a code file gets a new extension", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "script.py", type: "code" });
    expect(file.language).toBe("python");

    const renamed = await updateFile(owner.id, p.id, file.id, { path: "script.js" });
    expect(renamed.language).toBe("javascript");

    const explicit = await updateFile(owner.id, p.id, file.id, { path: "notes.txt", language: "markdown" });
    expect(explicit.language).toBe("markdown");
  });

  it("deletes a file", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "scratch.py", type: "code" });

    await deleteFile(owner.id, p.id, file.id);
    await expect(getFile(owner.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps a deleted file in the trash instead of destroying it", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "src/scratch.py", type: "code" });

    await deleteFile(owner.id, p.id, file.id);

    expect((await listFiles(owner.id, p.id)).map((f) => f.path)).not.toContain("src/scratch.py");
    const trash = await listTrash(owner.id, p.id);
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ id: file.id, path: "src/scratch.py" });
    expect(trash[0]?.deletedAt).toEqual(expect.any(String));
    const kept = Date.parse(trash[0]!.purgeAt) - Date.parse(trash[0]!.deletedAt);
    expect(kept).toBe(env.TRASH_RETENTION_DAYS * DAY_MS);
  });

  it("restores a file with its content and original path", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "keep.py", type: "code" });
    await prisma.file.update({ where: { id: file.id }, data: { yjsState: Buffer.from([1, 2, 3]) } });

    await deleteFile(owner.id, p.id, file.id);
    const restored = await restoreFile(owner.id, p.id, file.id);

    expect(restored.path).toBe("keep.py");
    expect((await listTrash(owner.id, p.id))).toHaveLength(0);
    const stored = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect([...stored.yjsState!]).toEqual([1, 2, 3]);
  });

  it("lets the same name be used again while the old file is in the trash, and refuses a clashing restore", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const old = await createFile(owner.id, p.id, { path: "a.py", type: "code" });
    await deleteFile(owner.id, p.id, old.id);

    const fresh = await createFile(owner.id, p.id, { path: "a.py", type: "code" });
    expect(fresh.id).not.toBe(old.id);

    await expect(restoreFile(owner.id, p.id, old.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("does not open or change a deleted file", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "gone.py", type: "code" });
    await deleteFile(owner.id, p.id, file.id);

    await expect(getFile(owner.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateFile(owner.id, p.id, file.id, { path: "x.py" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(deleteFile(owner.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets only the owner remove a file from the trash for good", async () => {
    const owner = await user();
    const editor = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: editor.email, role: "editor" });
    const file = await createFile(owner.id, p.id, { path: "bye.py", type: "code" });
    await deleteFile(editor.id, p.id, file.id);

    await expect(purgeFile(editor.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 403 });
    await purgeFile(owner.id, p.id, file.id);
    expect(await listTrash(owner.id, p.id)).toHaveLength(0);
    expect(await prisma.file.findUnique({ where: { id: file.id } })).toBeNull();
  });

  it("only purges files that are in the trash", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "alive.py", type: "code" });
    await expect(purgeFile(owner.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe("automatic trash cleanup", () => {
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

    /** A file deleted `days` ago (or a live one for `null`), as the hourly job would find it. */
    async function fileDeleted(projectId: string, ownerId: string, path: string, days: number | null) {
      const file = await createFile(ownerId, projectId, { path, type: "code" });
      if (days !== null) {
        await deleteFile(ownerId, projectId, file.id);
        await prisma.file.update({ where: { id: file.id }, data: { deletedAt: daysAgo(days) } });
      }
      return file.id;
    }

    const exists = async (id: string) => (await prisma.file.findUnique({ where: { id } })) !== null;

    it("deletes files that sat in the trash longer than the retention period, and nothing else", async () => {
      const owner = await user();
      const p = await project(owner.id);
      const expired = await fileDeleted(p.id, owner.id, "old.py", 31);
      const recent = await fileDeleted(p.id, owner.id, "recent.py", 29);
      const live = await fileDeleted(p.id, owner.id, "live.py", null);
      await prisma.file.update({ where: { id: live }, data: { updatedAt: daysAgo(400) } });

      expect(await purgeExpiredTrash(now, 30)).toBeGreaterThanOrEqual(1);

      expect(await exists(expired)).toBe(false);
      expect(await exists(recent)).toBe(true);
      expect(await exists(live)).toBe(true);
      expect((await listTrash(owner.id, p.id)).map((f) => f.id)).toEqual([recent]);
    });

    it("goes through everything that expired in several batches", async () => {
      const owner = await user();
      const p = await project(owner.id);
      const expired: string[] = [];
      for (let i = 0; i < 5; i += 1) expired.push(await fileDeleted(p.id, owner.id, `old${i}.py`, 45));

      expect(await purgeExpiredTrash(now, 30, 2)).toBeGreaterThanOrEqual(5);
      for (const id of expired) expect(await exists(id)).toBe(false);
    });

    it("follows a shorter retention when one is given", async () => {
      const owner = await user();
      const p = await project(owner.id);
      const weekOld = await fileDeleted(p.id, owner.id, "week.py", 8);

      await purgeExpiredTrash(now, 30);
      expect(await exists(weekOld)).toBe(true);
      await purgeExpiredTrash(now, 7);
      expect(await exists(weekOld)).toBe(false);
    });
  });
});
