import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { createFile, deleteFile, getFile, listFiles, updateFile } from "./files.service.js";

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

  it("deletes a file", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const file = await createFile(owner.id, p.id, { path: "scratch.py", type: "code" });

    await deleteFile(owner.id, p.id, file.id);
    await expect(getFile(owner.id, p.id, file.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
