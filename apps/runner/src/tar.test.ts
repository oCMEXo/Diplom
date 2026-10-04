import { describe, expect, it } from "vitest";
import { buildTar, safeTarPath } from "./tar.js";

/** A minimal ustar reader, enough to check what buildTar wrote. */
function readTar(archive: Buffer) {
  const files: Record<string, string> = {};
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const block = archive.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      block
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/, "");
    const name = field(0, 100);
    const prefix = field(345, 155);
    const size = parseInt(field(124, 12), 8);
    const stored = parseInt(field(148, 8), 8);
    const copy = Buffer.from(block);
    copy.fill(" ", 148, 156);
    expect(copy.reduce((sum, byte) => sum + byte, 0)).toBe(stored);
    files[prefix ? `${prefix}/${name}` : name] = archive.subarray(offset + 512, offset + 512 + size).toString("utf8");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

describe("buildTar", () => {
  it("round-trips paths and contents, including non-ASCII ones", () => {
    const files = [
      { path: "main.js", content: "console.log(1)" },
      { path: "scripts/запуск.js", content: "привет\n" },
      { path: "empty.txt", content: "" },
      { path: "big.txt", content: "x".repeat(1500) },
    ];
    expect(readTar(buildTar(files))).toEqual(Object.fromEntries(files.map((f) => [f.path, f.content])));
  });

  it("splits paths longer than 100 bytes into prefix and name", () => {
    const path = `${"d".repeat(60)}/${"e".repeat(60)}/file.txt`;
    expect(readTar(buildTar([{ path, content: "ok" }]))).toEqual({ [path]: "ok" });
  });

  it("skips unsafe paths and duplicates", () => {
    const archive = buildTar([
      { path: "../evil.txt", content: "x" },
      { path: "/abs.txt", content: "x" },
      { path: "a/../b.txt", content: "x" },
      { path: "ok.txt", content: "first" },
      { path: "ok.txt", content: "second" },
    ]);
    expect(readTar(archive)).toEqual({ "ok.txt": "first" });
  });

  it("ends with the two empty blocks tar expects", () => {
    expect(buildTar([]).length).toBe(1024);
  });
});

describe("safeTarPath", () => {
  it("accepts ordinary relative paths and rejects traversal", () => {
    expect(safeTarPath("a/b.txt")).toBe("a/b.txt");
    expect(safeTarPath("..")).toBeNull();
    expect(safeTarPath("a//b")).toBeNull();
    expect(safeTarPath("a\\b")).toBeNull();
    expect(safeTarPath("x".repeat(400))).toBeNull();
  });
});
