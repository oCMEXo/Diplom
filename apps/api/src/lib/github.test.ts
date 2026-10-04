import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";
import { downloadRepoZip, parseGithubUrl, zipUrl } from "./github.js";

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/octocat/Hello-World", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["https://github.com/octocat/Hello-World.git", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["http://www.github.com/octocat/Hello-World/", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["github.com/octocat/Hello-World", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["git@github.com:octocat/Hello-World.git", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["octocat/Hello-World", { owner: "octocat", repo: "Hello-World", ref: null }],
    ["https://github.com/octocat/Hello-World/tree/dev", { owner: "octocat", repo: "Hello-World", ref: "dev" }],
    ["https://github.com/octocat/Hello-World?tab=readme#top", { owner: "octocat", repo: "Hello-World", ref: null }],
  ])("reads %s", (input, expected) => {
    expect(parseGithubUrl(input)).toEqual(expected);
  });

  it.each([
    "",
    "https://gitlab.com/octocat/Hello-World",
    "https://evil.example/github.com/octocat/Hello-World",
    "https://github.com/octocat",
    "https://github.com/octo cat/repo",
    "https://github.com/-bad/repo",
    "https://github.com/octocat/../etc",
    "https://github.com/octocat/repo/tree/../../x",
    "a/b/c",
  ])("rejects %s", (input) => {
    expect(parseGithubUrl(input)).toBeNull();
  });

  it("only builds download links on codeload.github.com", () => {
    expect(zipUrl({ owner: "o", repo: "r", ref: null })).toBe("https://codeload.github.com/o/r/zip/HEAD");
    expect(zipUrl({ owner: "o", repo: "r", ref: "dev" })).toBe("https://codeload.github.com/o/r/zip/dev");
  });
});

type ResponseBody = ConstructorParameters<typeof Response>[0];

function reply(status: number, body: Uint8Array | null, headers: Record<string, string> = {}) {
  return new Response(body as ResponseBody, { status, headers });
}

const repo = { owner: "o", repo: "r", ref: null };

describe("downloadRepoZip", () => {
  it("returns the archive bytes", async () => {
    const bytes = await downloadRepoZip(repo, async () => reply(200, new Uint8Array([1, 2, 3])));
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("follows a redirect that stays on GitHub", async () => {
    const urls: string[] = [];
    const fake: typeof fetch = async (input) => {
      urls.push(String(input));
      return urls.length === 1
        ? reply(302, null, { location: "https://codeload.github.com/o/r/legacy.zip/HEAD" })
        : reply(200, new Uint8Array([7]));
    };
    const bytes = await downloadRepoZip(repo, fake);
    expect([...bytes]).toEqual([7]);
    expect(urls[1]).toContain("codeload.github.com");
  });

  it("refuses to follow a redirect to another host", async () => {
    const fake: typeof fetch = async () => reply(302, null, { location: "http://169.254.169.254/latest/meta-data" });
    await expect(downloadRepoZip(repo, fake)).rejects.toMatchObject({ statusCode: 502 });
  });

  it("reports a missing or private repository as 404", async () => {
    await expect(downloadRepoZip(repo, async () => reply(404, null))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("stops downloading past the size limit", async () => {
    const fake: typeof fetch = async () => reply(200, new Uint8Array(1000));
    await expect(downloadRepoZip(repo, fake, 500)).rejects.toMatchObject({ statusCode: 413 });
    await expect(downloadRepoZip(repo, fake, 500)).rejects.toBeInstanceOf(AppError);
  });

  it("turns a network failure into a 502", async () => {
    const fake: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(downloadRepoZip(repo, fake)).rejects.toMatchObject({ statusCode: 502 });
  });
});
