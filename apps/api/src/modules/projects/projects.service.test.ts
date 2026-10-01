import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import {
  createProject,
  deleteProject,
  getProject,
  inviteMember,
  listProjects,
  removeMember,
  updateMemberRole,
} from "./projects.service.js";

async function createTestUser() {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.local`,
      name: "Test User",
      passwordHash: "not-a-real-hash",
    },
  });
  return user;
}

describe("projects.service", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function user() {
    const u = await createTestUser();
    createdUserIds.push(u.id);
    return u;
  }

  async function project(ownerId: string, name = "Test project") {
    const p = await createProject(ownerId, { name });
    createdProjectIds.push(p.id);
    return p;
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("creates a project with the creator as owner", async () => {
    const owner = await user();
    const p = await project(owner.id);

    expect(p.ownerId).toBe(owner.id);
    expect(p.myRole).toBe("owner");
  });

  it("lists only projects the user is a member of", async () => {
    const owner = await user();
    const stranger = await user();
    await project(owner.id);

    const ownerProjects = await listProjects(owner.id);
    const strangerProjects = await listProjects(stranger.id);

    expect(ownerProjects.length).toBeGreaterThanOrEqual(1);
    expect(strangerProjects).toHaveLength(0);
  });

  it("hides project existence from non-members (404, not 403)", async () => {
    const owner = await user();
    const stranger = await user();
    const p = await project(owner.id);

    await expect(getProject(stranger.id, p.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lets the owner invite a member and the member sees the project", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner.id);

    const invited = await inviteMember(owner.id, p.id, { email: member.email, role: "editor" });
    expect(invited.role).toBe("editor");

    const fetched = await getProject(member.id, p.id);
    expect(fetched.members).toHaveLength(2);
  });

  it("rejects invites from a non-owner editor", async () => {
    const owner = await user();
    const editor = await user();
    const outsider = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: editor.email, role: "editor" });

    await expect(
      inviteMember(editor.id, p.id, { email: outsider.email, role: "viewer" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects duplicate invites", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: member.email, role: "viewer" });

    await expect(
      inviteMember(owner.id, p.id, { email: member.email, role: "editor" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lets the owner change a member's role but not their own", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: member.email, role: "viewer" });

    await updateMemberRole(owner.id, p.id, member.id, "editor");
    const fetched = await getProject(owner.id, p.id);
    expect(fetched.members.find((m) => m.userId === member.id)?.role).toBe("editor");

    await expect(updateMemberRole(owner.id, p.id, owner.id, "editor")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lets a member leave but not remove the owner", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: member.email, role: "viewer" });

    await removeMember(member.id, p.id, member.id);
    await expect(getProject(member.id, p.id)).rejects.toMatchObject({ statusCode: 404 });

    await expect(removeMember(owner.id, p.id, owner.id)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("deletes a project only for the owner", async () => {
    const owner = await user();
    const member = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: member.email, role: "editor" });

    await expect(deleteProject(member.id, p.id)).rejects.toMatchObject({ statusCode: 403 });

    await deleteProject(owner.id, p.id);
    await expect(getProject(owner.id, p.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
