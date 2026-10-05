import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { SEARCH_LIMITS, type FileType } from "@collab/shared";
import { buildApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { textToYjsState } from "../../lib/yjs-text.js";
import { createProject, inviteMember } from "../projects/projects.service.js";
import { searchProject } from "./search.service.js";

describe("search", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function user() {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Searcher", passwordHash: "x" },
    });
    userIds.push(created.id);
    return created;
  }

  async function project(ownerId: string) {
    const created = await createProject(ownerId, { name: "Search test" });
    projectIds.push(created.id);
    return created;
  }

  /** Files are written straight to the database, the way the sync server stores an edited document. */
  async function file(
    projectId: string,
    path: string,
    text: string,
    extra: { branch?: string; type?: FileType; deletedAt?: Date } = {},
  ) {
    return prisma.file.create({
      data: { projectId, path, yjsState: Buffer.from(textToYjsState(text)), ...extra },
    });
  }

  const paths = (result: Awaited<ReturnType<typeof searchProject>>) => result.files.map((f) => f.path);

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("finds every match with its 1-based line and column", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const main = await file(p.id, "src/main.js", "const total = 1;\n\n  let x = total + total;\nreturn x;");
    await file(p.id, "README.md", "Nothing to see here");

    const result = await searchProject(owner.id, p.id, "total");
    expect(result.truncated).toBe(false);
    expect(result.files).toEqual([
      {
        fileId: main.id,
        path: "src/main.js",
        matches: [
          { line: 1, column: 7, length: 5, preview: "const total = 1;", previewOffset: 6 },
          { line: 3, column: 11, length: 5, preview: "let x = total + total;", previewOffset: 8 },
          { line: 3, column: 19, length: 5, preview: "let x = total + total;", previewOffset: 16 },
        ],
      },
    ]);
  });

  it("ignores case, takes the query as plain text and trims it", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await file(p.id, "a.py", "print(Hello)\r\nHELLO()\r\nПривет, МИР");
    await file(p.id, "b.py", "hellXo");

    expect((await searchProject(owner.id, p.id, "hello")).files[0]!.matches.map((m) => m.line)).toEqual([1, 2]);
    expect((await searchProject(owner.id, p.id, "  мир ")).files[0]!.matches).toMatchObject([{ line: 3, column: 9 }]);
    // "." and "(" are not regex syntax here.
    expect(paths(await searchProject(owner.id, p.id, "hell."))).toEqual([]);
    expect((await searchProject(owner.id, p.id, "o()")).files[0]!.matches).toMatchObject([{ line: 2, column: 5 }]);
  });

  it("looks only at text files of the active branch, not in the trash or node_modules", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await prisma.project.update({ where: { id: p.id }, data: { githubBranch: "main" } });
    await file(p.id, "app.js", "needle", { branch: "main" });
    await file(p.id, "notes.md", "a needle in a doc", { branch: "main", type: "doc" });
    await file(p.id, "dev-only.js", "needle", { branch: "dev" });
    await file(p.id, ".trash/x/old.js", "needle", { branch: "main", deletedAt: new Date() });
    await file(p.id, "plan.board", "needle", { branch: "main", type: "board" });
    await file(p.id, "node_modules/lib/index.js", "needle", { branch: "main" });
    await file(p.id, "web/node_modules/x.js", "needle", { branch: "main" });

    expect(paths(await searchProject(owner.id, p.id, "needle"))).toEqual(["app.js", "notes.md"]);
  });

  it("cuts long lines to a window around the match", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await file(p.id, "min.js", `${"a".repeat(1000)}FOUND${"b".repeat(1000)}`);

    const [match] = (await searchProject(owner.id, p.id, "found")).files[0]!.matches;
    expect(match!.column).toBe(1001);
    expect(match!.preview.length).toBeLessThanOrEqual(SEARCH_LIMITS.previewChars + 2);
    expect(match!.preview.startsWith("…") && match!.preview.endsWith("…")).toBe(true);
    expect(match!.preview.slice(match!.previewOffset, match!.previewOffset + match!.length)).toBe("FOUND");
  });

  it("stops at the limits and says that results were cut", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await file(p.id, "one.txt", "hit\n".repeat(SEARCH_LIMITS.matchesPerFile + 10));

    const perFile = await searchProject(owner.id, p.id, "hit");
    expect(perFile.files[0]!.matches).toHaveLength(SEARCH_LIMITS.matchesPerFile);
    expect(perFile.truncated).toBe(true);

    const many = await project(owner.id);
    const fileCount = SEARCH_LIMITS.totalMatches / SEARCH_LIMITS.matchesPerFile + 2;
    for (let i = 0; i < fileCount; i++) {
      await file(many.id, `f${String(i).padStart(2, "0")}.txt`, "hit\n".repeat(SEARCH_LIMITS.matchesPerFile));
    }
    const total = await searchProject(owner.id, many.id, "hit");
    expect(total.files.reduce((sum, f) => sum + f.matches.length, 0)).toBe(SEARCH_LIMITS.totalMatches);
    expect(total.truncated).toBe(true);

    // Exactly at the limit nothing is missing.
    const exact = await project(owner.id);
    await file(exact.id, "one.txt", "hit\n".repeat(SEARCH_LIMITS.matchesPerFile));
    await file(exact.id, "two.txt", "nothing");
    expect((await searchProject(owner.id, exact.id, "hit")).truncated).toBe(false);
  });

  it("lets viewers search and hides the project from strangers", async () => {
    const owner = await user();
    const viewer = await user();
    const stranger = await user();
    const p = await project(owner.id);
    await inviteMember(owner.id, p.id, { email: viewer.email, role: "viewer" });
    await file(p.id, "main.js", "secret()");

    expect(paths(await searchProject(viewer.id, p.id, "secret"))).toEqual(["main.js"]);
    await expect(searchProject(stranger.id, p.id, "secret")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("is served at GET /projects/:id/search and refuses too short a query", async () => {
    const owner = await user();
    const p = await project(owner.id);
    await file(p.id, "main.js", "hello");
    const app = await buildApp({ rateLimit: { perMinute: 0, authPerMinute: 0 } });
    try {
      const headers = { authorization: `Bearer ${signAccessToken({ sub: owner.id, email: owner.email })}` };
      const ok = await app.inject({ method: "GET", url: `/projects/${p.id}/search?q=hell`, headers });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().files[0].path).toBe("main.js");

      const short = await app.inject({ method: "GET", url: `/projects/${p.id}/search?q=%20h%20`, headers });
      expect(short.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
