import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS } from "@collab/shared";
import { extractRepoFiles } from "./repo-files.js";

function archive(files: Record<string, string | Uint8Array>) {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[`repo-main/${name}`] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(entries);
}

describe("extractRepoFiles", () => {
  it("drops the archive root folder and infers type and language", () => {
    const { files } = extractRepoFiles(
      archive({ "README.md": "# Hi", "src/app.py": "print(1)", "src/util.ts": "export {}" }),
    );
    expect(files.map((f) => [f.path, f.type, f.language])).toEqual([
      ["README.md", "doc", "markdown"],
      ["src/app.py", "code", "python"],
      ["src/util.ts", "code", "typescript"],
    ]);
    expect(files.find((f) => f.path === "src/app.py")?.text).toBe("print(1)");
  });

  it("imports the repository as it is, apart from git internals, dependencies and OS litter", () => {
    const { files, skipped, skippedPaths } = extractRepoFiles(
      archive({
        "main.js": "1",
        "node_modules/lib/index.js": "x",
        ".git/config": "x",
        ".DS_Store": "x",
        "dist/bundle.js": "built",
        "package-lock.json": "{}",
        "public/app.min.js": "min",
      }),
    );
    expect(files.map((f) => f.path)).toEqual(["dist/bundle.js", "main.js", "package-lock.json", "public/app.min.js"]);
    expect(skipped.ignored).toBe(3);
    expect(skippedPaths).toEqual(["node_modules/", ".git/", ".DS_Store"]);
  });

  it("records the git blob sha of the original bytes", () => {
    const { files } = extractRepoFiles(archive({ "hello.txt": "hello\n" }));
    // Same value as: printf 'hello\n' | git hash-object --stdin
    expect(files[0]?.sha).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  it("skips binary files and files with invalid UTF-8", () => {
    const { files, skipped } = extractRepoFiles(
      archive({
        "a.txt": "text",
        "logo.png": new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
        "broken.txt": new Uint8Array([0xff, 0xfe, 0xfd]),
      }),
    );
    expect(files.map((f) => f.path)).toEqual(["a.txt"]);
    expect(skipped.binary).toBe(2);
  });

  it("skips files over the per-file limit", () => {
    const { files, skipped } = extractRepoFiles(
      archive({ "small.txt": "ok", "huge.txt": "a".repeat(IMPORT_LIMITS.maxFileBytes + 1) }),
    );
    expect(files.map((f) => f.path)).toEqual(["small.txt"]);
    expect(skipped.tooLarge).toBe(1);
  });

  it("keeps shallow files first when there are too many", () => {
    const many: Record<string, string> = { "README.md": "top" };
    for (let i = 0; i < IMPORT_LIMITS.maxFiles + 20; i += 1) many[`deep/dir/file${i}.txt`] = "x";
    const { files, skipped } = extractRepoFiles(archive(many));
    expect(files).toHaveLength(IMPORT_LIMITS.maxFiles);
    expect(files.some((f) => f.path === "README.md")).toBe(true);
    expect(skipped.overLimit).toBe(21);
  });

  it("ignores paths that try to escape the project", () => {
    const zip = zipSync({
      "repo-main/ok.txt": strToU8("ok"),
      "repo-main/../evil.txt": strToU8("x"),
    });
    const { files } = extractRepoFiles(zip);
    expect(files.map((f) => f.path)).toEqual(["ok.txt"]);
  });

  it("rejects something that is not a zip archive", () => {
    expect(() => extractRepoFiles(strToU8("not a zip"))).toThrow(/архив/);
  });
});
