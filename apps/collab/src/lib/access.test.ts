import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { resolveFileAccess } from "./access.js";

function signToken(userId: string) {
  return jwt.sign({ sub: userId, email: "x@test.local" }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: "1h",
  });
}

async function createUser() {
  return prisma.user.create({
    data: { email: `${randomUUID()}@test.local`, name: "Test", passwordHash: "x" },
  });
}

describe("resolveFileAccess", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user() {
    const u = await createUser();
    userIds.push(u.id);
    return u;
  }

  async function projectWithFile(ownerId: string, role: "editor" | "viewer" | null, memberId?: string) {
    const project = await prisma.project.create({
      data: {
        name: "collab test project",
        ownerId,
        inviteCode: randomUUID(),
        members: { create: { userId: ownerId, role: "owner" } },
      },
    });
    projectIds.push(project.id);
    if (role && memberId) {
      await prisma.projectMember.create({ data: { projectId: project.id, userId: memberId, role } });
    }
    const file = await prisma.file.create({
      data: { projectId: project.id, path: "main.py", type: "code", language: "python" },
    });
    return { project, file };
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("grants access for a project member with their role", async () => {
    const owner = await user();
    const editor = await user();
    const { file } = await projectWithFile(owner.id, "editor", editor.id);

    const access = await resolveFileAccess(signToken(editor.id), file.id);
    expect(access.role).toBe("editor");
    expect(access.userId).toBe(editor.id);
  });

  it("rejects a user who is not a project member", async () => {
    const owner = await user();
    const stranger = await user();
    const { file } = await projectWithFile(owner.id, null);

    await expect(resolveFileAccess(signToken(stranger.id), file.id)).rejects.toThrow(
      "Not a member of this project",
    );
  });

  it("rejects an unknown file id", async () => {
    const owner = await user();
    await expect(resolveFileAccess(signToken(owner.id), randomUUID())).rejects.toThrow(
      "File not found",
    );
  });

  it("rejects a malformed token", async () => {
    const owner = await user();
    const { file } = await projectWithFile(owner.id, null);

    await expect(resolveFileAccess("not-a-real-token", file.id)).rejects.toThrow(
      "Invalid or expired token",
    );
  });
});
