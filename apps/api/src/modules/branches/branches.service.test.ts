import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import type { RealtimeEvent } from "@collab/shared";
import { hub } from "../../lib/hub.js";
import { textToYjsState, yjsStateToText } from "../../lib/yjs-text.js";
import { createFile, listFiles } from "../files/files.service.js";
import { importFromGithub } from "../import/import.service.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { listProjectBranches, switchBranch } from "./branches.service.js";

type ResponseBody = ConstructorParameters<typeof Response>[0];

/** A public repository with a few branches, as GitHub's API and codeload would serve it. */
function fakeRepo(branches: Record<string, Record<string, string>>, defaultBranch = "main") {
  const downloads: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.github.com") {
      if (url.pathname === "/repos/octocat/demo") {
        return new Response(JSON.stringify({ default_branch: defaultBranch }), { status: 200 });
      }
      if (url.pathname === "/repos/octocat/demo/branches") {
        return new Response(JSON.stringify(Object.keys(branches).map((name) => ({ name }))), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }
    const ref = decodeURIComponent(url.pathname.replace("/octocat/demo/zip/", ""));
    const name = ref === "HEAD" ? defaultBranch : ref;
    downloads.push(name);
    const files = branches[name];
    if (!files) return new Response(null, { status: 404 });
    const entries: Record<string, Uint8Array> = {};
    for (const [path, content] of Object.entries(files)) entries[`demo-${name.replaceAll("/", "-")}/${path}`] = strToU8(content); // GitHub turns "/" into "-" here
    return new Response(zipSync(entries) as ResponseBody, { status: 200 });
  };
  return { fetchImpl, downloads };
}

const REPO = {
  main: { "README.md": "# main", "app.js": "console.log('main')" },
  dev: { "README.md": "# dev", "app.js": "console.log('dev')", "feature.js": "export {}" },
  "feature/login": { "login.js": "login()" },
};

describe("branches", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user() {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Brancher", passwordHash: "x" },
    });
    userIds.push(created.id);
    return created;
  }

  async function importedProject(ownerId: string, github = fakeRepo(REPO)) {
    const project = await createProject(ownerId, { name: "Branches test" });
    projectIds.push(project.id);
    await importFromGithub(ownerId, project.id, "https://github.com/octocat/demo", github.fetchImpl);
    return { project, github };
  }

  const paths = async (userId: string, projectId: string) => (await listFiles(userId, projectId)).map((f) => f.path).sort();

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("names the branch at import and lists the repository's branches, default first", async () => {
    const owner = await user();
    const { project, github } = await importedProject(owner.id);

    const stored = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.githubBranch).toBe("main");

    const list = await listProjectBranches(owner.id, project.id, github.fetchImpl);
    expect(list).toMatchObject({ active: "main", defaultBranch: "main", loaded: ["main"] });
    expect(list.branches).toEqual(["main", "dev", "feature/login"]);
  });

  it("opens another branch with its own files and keeps each branch's edits", async () => {
    const owner = await user();
    const { project, github } = await importedProject(owner.id);

    const toDev = await switchBranch(owner.id, project.id, "dev", github.fetchImpl);
    expect(toDev).toEqual({ branch: "dev", imported: 3 });
    expect(await paths(owner.id, project.id)).toEqual(["README.md", "app.js", "feature.js"]);

    // An edit made on dev…
    const devApp = await prisma.file.findFirstOrThrow({ where: { projectId: project.id, branch: "dev", path: "app.js" } });
    await prisma.file.update({ where: { id: devApp.id }, data: { yjsState: Buffer.from(textToYjsState("edited on dev")) } });

    // …does not touch main, which comes back without downloading anything.
    const downloadsBefore = github.downloads.length;
    expect(await switchBranch(owner.id, project.id, "main", github.fetchImpl)).toEqual({ branch: "main", imported: 0 });
    expect(github.downloads.length).toBe(downloadsBefore);
    expect(await paths(owner.id, project.id)).toEqual(["README.md", "app.js"]);
    const mainApp = await prisma.file.findFirstOrThrow({ where: { projectId: project.id, branch: "main", path: "app.js" } });
    expect(yjsStateToText(mainApp.yjsState)).toBe("console.log('main')");

    // Back on dev, the edit is still there.
    await switchBranch(owner.id, project.id, "dev", github.fetchImpl);
    const again = await prisma.file.findUniqueOrThrow({ where: { id: devApp.id } });
    expect(yjsStateToText(again.yjsState)).toBe("edited on dev");
  });

  it("puts new files into the active branch, so the same name can exist on two branches", async () => {
    const owner = await user();
    const { project, github } = await importedProject(owner.id);
    await createFile(owner.id, project.id, { path: "notes.md", type: "doc" });
    await switchBranch(owner.id, project.id, "dev", github.fetchImpl);
    await createFile(owner.id, project.id, { path: "notes.md", type: "doc" });

    const notes = await prisma.file.findMany({ where: { projectId: project.id, path: "notes.md" } });
    expect(notes.map((file) => file.branch).sort()).toEqual(["dev", "main"]);
  });

  it("handles branch names with slashes", async () => {
    const owner = await user();
    const { project, github } = await importedProject(owner.id);
    await switchBranch(owner.id, project.id, "feature/login", github.fetchImpl);
    expect(await paths(owner.id, project.id)).toEqual(["login.js"]);
  });

  it("tells everyone in the project that the branch changed", async () => {
    const owner = await user();
    const { project, github } = await importedProject(owner.id);
    const events: RealtimeEvent[] = [];
    const socket = { send: (data: string) => events.push(JSON.parse(data)), readyState: 1 };
    const unsubscribe = hub.subscribe(project.id, socket);
    try {
      await switchBranch(owner.id, project.id, "dev", github.fetchImpl);
    } finally {
      unsubscribe();
    }
    expect(events).toContainEqual({ type: "project.branch", projectId: project.id, branch: "dev" });
  });

  it("gives names to the files of a project imported before branches had names", async () => {
    const owner = await user();
    const github = fakeRepo(REPO);
    const project = await createProject(owner.id, { name: "Legacy" });
    projectIds.push(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { githubOwner: "octocat", githubRepo: "demo", githubBranch: null },
    });
    await prisma.file.create({ data: { projectId: project.id, path: "old.js", type: "code" } });

    await switchBranch(owner.id, project.id, "dev", github.fetchImpl);
    await switchBranch(owner.id, project.id, "main", github.fetchImpl);

    expect(await paths(owner.id, project.id)).toEqual(["old.js"]);
  });

  it("refuses viewers, unlinked projects, unknown branches and odd names", async () => {
    const owner = await user();
    const viewer = await user();
    const { project, github } = await importedProject(owner.id);
    await inviteMember(owner.id, project.id, { email: viewer.email, role: "viewer" });

    await expect(switchBranch(viewer.id, project.id, "dev", github.fetchImpl)).rejects.toMatchObject({ statusCode: 403 });
    await expect(switchBranch(owner.id, project.id, "no-such-branch", github.fetchImpl)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).githubBranch).toBe("main");
    for (const bad of ["../x", "-x", "a b", "x/"]) {
      await expect(switchBranch(owner.id, project.id, bad, github.fetchImpl)).rejects.toMatchObject({ statusCode: 400 });
    }

    const plain = await createProject(owner.id, { name: "No repo" });
    projectIds.push(plain.id);
    await expect(switchBranch(owner.id, plain.id, "dev", github.fetchImpl)).rejects.toMatchObject({ statusCode: 400 });
  });
});
