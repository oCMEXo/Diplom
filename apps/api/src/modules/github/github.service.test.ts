import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { gitBlobSha } from "../../lib/git-blob.js";
import { textToYjsState } from "../../lib/yjs-text.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { listBranches, pushToGithub } from "./github.service.js";

const TOKEN = "ghp_test_token_123456";

interface Entry {
  path: string;
  mode: string;
  type: "blob";
  sha: string;
  content: string;
}

/** A tiny in-memory GitHub: just the Git Data endpoints the push uses. */
function fakeGithub(initial: Record<string, string>, options: { canPush?: boolean; defaultBranch?: string } = {}) {
  const defaultBranch = options.defaultBranch ?? "main";
  const trees = new Map<string, Entry[]>();
  const commits = new Map<string, { tree: string; message?: string }>();
  const branches = new Map<string, string>();
  const calls: string[] = [];

  const hash = (value: string) => createHash("sha1").update(value).digest("hex");
  const saveTree = (entries: Entry[]) => {
    const sha = hash(JSON.stringify(entries.map((entry) => [entry.path, entry.sha])));
    trees.set(sha, entries);
    return sha;
  };
  const entry = (path: string, content: string, mode = "100644"): Entry => ({
    path,
    mode,
    type: "blob",
    sha: gitBlobSha(content),
    content,
  });

  const rootTree = saveTree(Object.entries(initial).map(([path, content]) => entry(path, content)));
  commits.set("c0", { tree: rootTree });
  branches.set(defaultBranch, "c0");

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string>;
    calls.push(`${method} ${url.pathname}`);
    if (headers.Authorization !== `Bearer ${TOKEN}`) return json({ message: "Bad credentials" }, 401);

    const path = url.pathname.replace("/repos/octocat/demo", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (path === "/branches") return json([...branches.keys()].map((name) => ({ name })));
    if (path === "") return json({ default_branch: defaultBranch, permissions: { push: options.canPush ?? true } });

    const ref = path.match(/^\/git\/ref\/heads\/(.+)$/);
    if (ref) {
      const sha = branches.get(decodeURIComponent(ref[1]!).replaceAll("%2F", "/"));
      return sha ? json({ object: { sha } }) : json({ message: "Not Found" }, 404);
    }
    const commitGet = path.match(/^\/git\/commits\/(.+)$/);
    if (commitGet && method === "GET") {
      const commit = commits.get(commitGet[1]!);
      return commit ? json({ tree: { sha: commit.tree } }) : json({ message: "Not Found" }, 404);
    }
    const treeGet = path.match(/^\/git\/trees\/(.+)$/);
    if (treeGet && method === "GET") {
      const entries = trees.get(treeGet[1]!);
      return entries ? json({ truncated: false, tree: entries }) : json({ message: "Not Found" }, 404);
    }
    if (path === "/git/trees" && method === "POST") {
      const merged = new Map((trees.get(body.base_tree) ?? []).map((item) => [item.path, item]));
      for (const item of body.tree) merged.set(item.path, entry(item.path, item.content, item.mode));
      return json({ sha: saveTree([...merged.values()]) }, 201);
    }
    if (path === "/git/commits" && method === "POST") {
      const sha = `c${commits.size}`;
      commits.set(sha, { tree: body.tree, message: body.message });
      return json({ sha, html_url: `https://github.com/octocat/demo/commit/${sha}` }, 201);
    }
    if (path === "/git/refs" && method === "POST") {
      branches.set(String(body.ref).replace("refs/heads/", ""), body.sha);
      return json({}, 201);
    }
    const refPatch = path.match(/^\/git\/refs\/heads\/(.+)$/);
    if (refPatch && method === "PATCH") {
      branches.set(refPatch[1]!, body.sha);
      return json({});
    }
    return json({ message: "Not Found" }, 404);
  };

  return {
    fetchImpl,
    calls,
    branches,
    commits,
    /** Content of a file on a branch, as GitHub would serve it. */
    read(branch: string, path: string) {
      const commit = commits.get(branches.get(branch)!)!;
      return trees.get(commit.tree)!.find((item) => item.path === path)?.content;
    },
    /** Simulates someone else committing to the branch. */
    commitElsewhere(branch: string, path: string, content: string) {
      const commit = commits.get(branches.get(branch)!)!;
      const entries = trees.get(commit.tree)!.filter((item) => item.path !== path);
      entries.push(entry(path, content));
      const sha = `c${commits.size}`;
      commits.set(sha, { tree: saveTree(entries) });
      branches.set(branch, sha);
    },
  };
}

describe("pushToGithub", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user() {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Pusher", passwordHash: "not-a-real-hash" },
    });
    userIds.push(created.id);
    return created;
  }

  /** A project whose files were "imported" from the given repository contents. */
  async function linkedProject(ownerId: string, files: Record<string, string>, link = true) {
    const project = await createProject(ownerId, { name: "Push test project" });
    projectIds.push(project.id);
    if (link) {
      await prisma.project.update({
        where: { id: project.id },
        data: { githubOwner: "octocat", githubRepo: "demo", githubBranch: null },
      });
    }
    for (const [path, content] of Object.entries(files)) {
      await prisma.file.create({
        data: {
          projectId: project.id,
          path,
          type: "code",
          yjsState: Buffer.from(textToYjsState(content)),
          sourceSha: link ? gitBlobSha(content) : null,
        },
      });
    }
    return project;
  }

  async function edit(projectId: string, path: string, content: string) {
    await prisma.file.update({
      where: { projectId_path: { projectId, path } },
      data: { yjsState: Buffer.from(textToYjsState(content)) },
    });
  }

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const input = { token: TOKEN, message: "Update from Collab" };

  it("commits only the files that changed and remembers the new state", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one", "b.txt": "two" });
    const project = await linkedProject(owner.id, { "a.txt": "one", "b.txt": "two" });
    await edit(project.id, "a.txt", "one changed");
    await prisma.file.create({
      data: { projectId: project.id, path: "c.txt", type: "code", yjsState: Buffer.from(textToYjsState("brand new")) },
    });

    const result = await pushToGithub(owner.id, project.id, input, github.fetchImpl);

    expect(result).toMatchObject({ branch: "main", newBranch: false, added: 1, modified: 1, unchanged: 1 });
    expect(result.commitUrl).toContain("/commit/");
    expect(github.read("main", "a.txt")).toBe("one changed");
    expect(github.read("main", "b.txt")).toBe("two");
    expect(github.read("main", "c.txt")).toBe("brand new");

    const stored = await prisma.file.findFirstOrThrow({ where: { projectId: project.id, path: "a.txt" } });
    expect(stored.sourceSha).toBe(gitBlobSha("one changed"));
    await expect(pushToGithub(owner.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Нет изменений"),
    });
  });

  it("stops when a file also changed on GitHub, unless told to overwrite", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one" });
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    await edit(project.id, "a.txt", "mine");
    github.commitElsewhere("main", "a.txt", "theirs");

    await expect(pushToGithub(owner.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("a.txt"),
    });
    expect(github.read("main", "a.txt")).toBe("theirs");

    await pushToGithub(owner.id, project.id, { ...input, overwrite: true }, github.fetchImpl);
    expect(github.read("main", "a.txt")).toBe("mine");
  });

  it("keeps other people's commits on other files", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one", "b.txt": "two" });
    const project = await linkedProject(owner.id, { "a.txt": "one", "b.txt": "two" });
    await edit(project.id, "a.txt", "mine");
    github.commitElsewhere("main", "b.txt", "theirs");

    await pushToGithub(owner.id, project.id, input, github.fetchImpl);

    expect(github.read("main", "a.txt")).toBe("mine");
    expect(github.read("main", "b.txt")).toBe("theirs");
  });

  it("creates the branch when it does not exist and leaves main alone", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one" });
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    await edit(project.id, "a.txt", "mine");

    const result = await pushToGithub(owner.id, project.id, { ...input, branch: "collab/edits" }, github.fetchImpl);

    expect(result).toMatchObject({ branch: "collab/edits", newBranch: true, modified: 1 });
    expect(github.read("collab/edits", "a.txt")).toBe("mine");
    expect(github.read("main", "a.txt")).toBe("one");
    const stored = await prisma.file.findFirstOrThrow({ where: { projectId: project.id, path: "a.txt" } });
    expect(stored.sourceSha).toBe(gitBlobSha("one"));
  });

  it("links an unlinked project on the first push", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "same" });
    const project = await linkedProject(owner.id, { "a.txt": "same", "new.txt": "fresh" }, false);

    await expect(pushToGithub(owner.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({ statusCode: 400 });

    const result = await pushToGithub(
      owner.id,
      project.id,
      { ...input, repoUrl: "https://github.com/octocat/demo" },
      github.fetchImpl,
    );
    expect(result).toMatchObject({ added: 1, unchanged: 1 });
    const linked = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect([linked.githubOwner, linked.githubRepo]).toEqual(["octocat", "demo"]);
  });

  it("does not push boards or empty new files", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one" });
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    await prisma.file.create({ data: { projectId: project.id, path: "ideas.board", type: "board" } });
    await prisma.file.create({ data: { projectId: project.id, path: "empty.txt", type: "code" } });

    await expect(pushToGithub(owner.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("Нет изменений"),
    });
  });

  it("reports a bad token, a read-only token and a missing repository clearly", async () => {
    const owner = await user();
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    await edit(project.id, "a.txt", "mine");

    await expect(
      pushToGithub(owner.id, project.id, { ...input, token: "wrong_token_value" }, fakeGithub({ "a.txt": "one" }).fetchImpl),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("токен") });

    await expect(
      pushToGithub(owner.id, project.id, input, fakeGithub({ "a.txt": "one" }, { canPush: false }).fetchImpl),
    ).rejects.toMatchObject({ statusCode: 403 });

    await prisma.project.update({ where: { id: project.id }, data: { githubRepo: "missing" } });
    await expect(pushToGithub(owner.id, project.id, input, fakeGithub({}).fetchImpl)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("is open to editors only", async () => {
    const owner = await user();
    const viewer = await user();
    const stranger = await user();
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    await inviteMember(owner.id, project.id, { email: viewer.email, role: "viewer" });
    const github = fakeGithub({ "a.txt": "one" });

    await expect(pushToGithub(viewer.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({ statusCode: 403 });
    await expect(pushToGithub(stranger.id, project.id, input, github.fetchImpl)).rejects.toMatchObject({ statusCode: 404 });
    expect(github.calls).toEqual([]);
  });

  it("rejects branch names that could do harm", async () => {
    const owner = await user();
    const project = await linkedProject(owner.id, { "a.txt": "one" });
    for (const branch of ["../x", "-flag", "a b", "x.lock", "trailing/"]) {
      await expect(
        pushToGithub(owner.id, project.id, { ...input, branch }, fakeGithub({ "a.txt": "one" }).fetchImpl),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it("lists the branches with the default one first, ready for a picker", async () => {
    const owner = await user();
    const github = fakeGithub({ "a.txt": "one" });
    github.branches.set("dev", "c0");
    github.branches.set("alpha", "c0");
    const project = await linkedProject(owner.id, { "a.txt": "one" });

    const result = await listBranches(owner.id, project.id, { token: TOKEN }, github.fetchImpl);

    expect(result).toMatchObject({ defaultBranch: "main", canPush: true, repo: { owner: "octocat", name: "demo" } });
    expect(result.branches).toEqual(["main", "dev", "alpha"]);
  });

  it("needs the repository link for an unlinked project and a valid token for the list", async () => {
    const owner = await user();
    const project = await linkedProject(owner.id, { "a.txt": "one" }, false);
    const github = fakeGithub({ "a.txt": "one" });

    await expect(listBranches(owner.id, project.id, { token: TOKEN }, github.fetchImpl)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      listBranches(owner.id, project.id, { token: TOKEN, repoUrl: "octocat/demo" }, github.fetchImpl),
    ).resolves.toMatchObject({ branches: ["main"] });
    await expect(
      listBranches(owner.id, project.id, { token: "wrong_token_value", repoUrl: "octocat/demo" }, github.fetchImpl),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
