import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@collab/db";
import { MAX_VERSIONS_PER_FILE, SNAPSHOT_INTERVAL_MS, forgetFile, snapshotIfChanged } from "./versions.js";

const MINUTE = 60 * 1000;

describe("snapshotIfChanged", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function codeFile() {
    const owner = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Versions", passwordHash: "x" },
    });
    userIds.push(owner.id);
    const project = await prisma.project.create({
      data: {
        name: "versions test project",
        ownerId: owner.id,
        inviteCode: randomUUID(),
        members: { create: { userId: owner.id, role: "owner" } },
      },
    });
    projectIds.push(project.id);
    const file = await prisma.file.create({
      data: { projectId: project.id, path: "main.py", type: "code", language: "python" },
    });
    return { owner, file };
  }

  const versionsOf = (fileId: string) =>
    prisma.fileVersion.findMany({ where: { fileId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("takes the first snapshot at once and no other within the interval", async () => {
    const { owner, file } = await codeFile();
    const t0 = Date.now();

    expect(await snapshotIfChanged(file.id, () => "print(1)", owner.id, t0)).toBe(true);
    expect(await snapshotIfChanged(file.id, () => "print(12)", owner.id, t0 + MINUTE)).toBe(false);
    expect(await snapshotIfChanged(file.id, () => "print(123)", owner.id, t0 + SNAPSHOT_INTERVAL_MS - 1)).toBe(false);

    const versions = await versionsOf(file.id);
    expect(versions.map((version) => version.content)).toEqual(["print(1)"]);
    expect(versions[0]).toMatchObject({ authorId: owner.id, size: 8 });
  });

  it("after the interval takes a snapshot only if the text changed", async () => {
    const { owner, file } = await codeFile();
    const t0 = Date.now();
    await snapshotIfChanged(file.id, () => "a = 1", owner.id, t0);

    expect(await snapshotIfChanged(file.id, () => "a = 1", owner.id, t0 + SNAPSHOT_INTERVAL_MS + MINUTE)).toBe(false);
    expect(await snapshotIfChanged(file.id, () => "a = 2", null, t0 + SNAPSHOT_INTERVAL_MS + 2 * MINUTE)).toBe(true);

    const versions = await versionsOf(file.id);
    expect(versions.map((version) => version.content)).toEqual(["a = 1", "a = 2"]);
    expect(versions[1].authorId).toBeNull();
  });

  it("does not even read the text while the interval has not passed", async () => {
    const { owner, file } = await codeFile();
    const t0 = Date.now();
    await snapshotIfChanged(file.id, () => "x", owner.id, t0);

    const read = vi.fn(() => "xy");
    await snapshotIfChanged(file.id, read, owner.id, t0 + MINUTE);
    expect(read).not.toHaveBeenCalled();
  });

  it("after a restart goes by the latest version in the database", async () => {
    const { owner, file } = await codeFile();
    const now = Date.now();
    await prisma.fileVersion.create({
      data: { fileId: file.id, content: "old", size: 3, createdAt: new Date(now - MINUTE) },
    });
    forgetFile(file.id);

    expect(await snapshotIfChanged(file.id, () => "new", owner.id, now)).toBe(false);
    expect(await snapshotIfChanged(file.id, () => "old", owner.id, now + SNAPSHOT_INTERVAL_MS)).toBe(false);
    expect(await snapshotIfChanged(file.id, () => "new", owner.id, now + SNAPSHOT_INTERVAL_MS)).toBe(true);
  });

  it(`keeps only the newest ${MAX_VERSIONS_PER_FILE} versions`, async () => {
    const { owner, file } = await codeFile();
    const start = Date.now() - 2 * MAX_VERSIONS_PER_FILE * SNAPSHOT_INTERVAL_MS;
    await prisma.fileVersion.createMany({
      data: Array.from({ length: MAX_VERSIONS_PER_FILE }, (_, i) => ({
        fileId: file.id,
        content: `v${i}`,
        size: 2,
        createdAt: new Date(start + i * SNAPSHOT_INTERVAL_MS),
      })),
    });
    forgetFile(file.id);

    expect(await snapshotIfChanged(file.id, () => "latest", owner.id)).toBe(true);

    const versions = await versionsOf(file.id);
    expect(versions).toHaveLength(MAX_VERSIONS_PER_FILE);
    expect(versions[0].content).toBe("v1");
    expect(versions.at(-1)?.content).toBe("latest");
  });
});
