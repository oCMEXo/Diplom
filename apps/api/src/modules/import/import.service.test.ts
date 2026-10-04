import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prisma } from "@collab/db";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { importFromGithub } from "./import.service.js";

type ResponseBody = ConstructorParameters<typeof Response>[0];

const REPO_URL = "https://github.com/octocat/demo";

function fakeGithub(files: Record<string, string>): typeof fetch {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[`demo-main/${name}`] = strToU8(content);
  const zip = zipSync(entries);
  return async () => new Response(zip as ResponseBody, { status: 200 });
}

describe("importFromGithub", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user(name = "Importer") {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name, passwordHash: "not-a-real-hash" },
    });
    userIds.push(created.id);
    return created;
  }

  async function project(ownerId: string) {
    const created = await createProject(ownerId, { name: "Import test project" });
    projectIds.push(created.id);
    return created;
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("creates the repository files with their content ready in the editor document", async () => {
    const owner = await user();
    const p = await project(owner.id);

    const result = await importFromGithub(
      owner.id,
      p.id,
      REPO_URL,
      fakeGithub({ "main.py": "print('привет')", "docs/README.md": "# Demo" }),
    );

    expect(result.imported).toBe(2);
    expect(result.repo).toEqual({ owner: "octocat", name: "demo", ref: null });

    const stored = await prisma.file.findMany({ where: { projectId: p.id }, orderBy: { path: "asc" } });
    expect(stored.map((f) => [f.path, f.type])).toEqual([
      ["docs/README.md", "doc"],
      ["main.py", "code"],
    ]);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, stored.find((f) => f.path === "main.py")!.yjsState!);
    expect(doc.getText("monaco").toString()).toBe("print('привет')");
  });

  it("does not overwrite files that already exist", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await prisma.file.create({ data: { projectId: p.id, path: "main.py", type: "code" } });

    const result = await importFromGithub(owner.id, p.id, REPO_URL, fakeGithub({ "main.py": "new", "extra.py": "x" }));

    expect(result.imported).toBe(1);
    expect(result.skipped.existing).toBe(1);
    const existing = await prisma.file.findFirstOrThrow({ where: { projectId: p.id, path: "main.py" } });
    expect(existing.yjsState).toBeNull();
  });

  it("lets editors import but not viewers or strangers", async () => {
    const owner = await user();
    const editor = await user();
    const viewer = await user();
    const stranger = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: editor.email, role: "editor" });
    await inviteMember(owner.id, p.id, { email: viewer.email, role: "viewer" });
    const github = fakeGithub({ "a.txt": "a" });

    await expect(importFromGithub(editor.id, p.id, REPO_URL, github)).resolves.toMatchObject({ imported: 1 });
    await expect(importFromGithub(viewer.id, p.id, REPO_URL, github)).rejects.toMatchObject({ statusCode: 403 });
    await expect(importFromGithub(stranger.id, p.id, REPO_URL, github)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects links that are not GitHub repositories before downloading anything", async () => {
    const owner = await user();
    const p = await project(owner.id);
    let called = false;
    const spy: typeof fetch = async () => {
      called = true;
      return new Response(null, { status: 500 });
    };

    await expect(importFromGithub(owner.id, p.id, "https://example.com/x/y", spy)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(called).toBe(false);
  });
});
