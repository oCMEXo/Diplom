import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import type { RunJob } from "@collab/shared";
import { createProject } from "../projects/projects.service.js";
import { createFile } from "../files/files.service.js";
import { textToYjsState } from "../../lib/yjs-text.js";
import { requestRun } from "./runs.service.js";

describe("requestRun", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user(name = "Runner") {
    const u = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name, passwordHash: "x" },
    });
    userIds.push(u.id);
    return u;
  }

  async function projectWithFile(ownerId: string, path: string, type: "code" | "doc" = "code") {
    const p = await createProject(ownerId, { name: "run project" });
    projectIds.push(p.id);
    const file = await createFile(ownerId, p.id, { path, type });
    return { project: p, file };
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("enqueues a job with the language inferred from the file extension", async () => {
    const owner = await user("Аня");
    const { project, file } = await projectWithFile(owner.id, "main.py");

    const jobs: RunJob[] = [];
    const { runId } = await requestRun(owner.id, project.id, file.id, "print(1)", async (j) => {
      jobs.push(j);
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      runId,
      projectId: project.id,
      fileId: file.id,
      language: "python",
      code: "print(1)",
      startedBy: { id: owner.id, name: "Аня" },
    });
  });

  it("sends the rest of the project along, so the program can import its neighbours", async () => {
    const owner = await user();
    const { project, file } = await projectWithFile(owner.id, "scripts/run.js");
    const add = (path: string, text: string | null, type: "code" | "board" = "code") =>
      prisma.file.create({
        data: {
          projectId: project.id,
          path,
          type,
          yjsState: text === null ? null : Buffer.from(textToYjsState(text)),
        },
      });
    await add("logger.js", "module.exports = () => {};");
    await add("lib/empty.py", null);
    await add("ideas.board", "not text", "board");
    await add("node_modules/pkg/index.js", "ignored");

    const jobs: RunJob[] = [];
    await requestRun(owner.id, project.id, file.id, "require('../logger')", async (j) => void jobs.push(j));

    expect(jobs[0]?.entry).toBe("scripts/run.js");
    expect(jobs[0]?.code).toBe("require('../logger')");
    expect(jobs[0]?.files).toEqual([
      { path: "logger.js", content: "module.exports = () => {};" },
      { path: "lib/empty.py", content: "" },
    ]);
  });

  it("runs javascript files too", async () => {
    const owner = await user();
    const { project, file } = await projectWithFile(owner.id, "src/app.js");
    const jobs: RunJob[] = [];
    await requestRun(owner.id, project.id, file.id, "1", async (j) => void jobs.push(j));
    expect(jobs[0]?.language).toBe("javascript");
  });

  it("refuses languages that cannot be run", async () => {
    const owner = await user();
    const { project, file } = await projectWithFile(owner.id, "Main.java");
    await expect(
      requestRun(owner.id, project.id, file.id, "x", async () => undefined),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses non-code files", async () => {
    const owner = await user();
    const { project, file } = await projectWithFile(owner.id, "notes.py", "doc");
    await expect(
      requestRun(owner.id, project.id, file.id, "x", async () => undefined),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("does not let viewers run code", async () => {
    const owner = await user();
    const viewer = await user();
    const { project, file } = await projectWithFile(owner.id, "main.py");
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: viewer.id, role: "viewer" },
    });

    await expect(
      requestRun(viewer.id, project.id, file.id, "print(1)", async () => undefined),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("hides the file from non-members and from other projects", async () => {
    const owner = await user();
    const stranger = await user();
    const a = await projectWithFile(owner.id, "main.py");
    const b = await projectWithFile(owner.id, "other.py");

    await expect(
      requestRun(stranger.id, a.project.id, a.file.id, "x", async () => undefined),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      requestRun(owner.id, a.project.id, b.file.id, "x", async () => undefined),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
