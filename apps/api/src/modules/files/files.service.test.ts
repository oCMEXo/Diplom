import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { createProject, inviteMember } from "../projects/projects.service.js";
import {
  createFile,
  deleteFile,
  getFile,
  listFiles,
  listTrash,
  purgeFile,
  restoreFile,
  updateFile,
} from "./files.service.js";

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
});
