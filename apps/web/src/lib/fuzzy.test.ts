import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzy";

const paths = (items: { path: string }[]) => items.map((item) => item.path);
const files = ["contracts/Lock.sol", "contracts/Greeter.sol", "scripts/deployLock.js", "package.json", "README.md"].map((path) => ({ path }));

describe("fuzzyScore", () => {
  it("matches characters in order, not as a substring", () => {
    expect(fuzzyScore("dpl", "scripts/deployLock.js")).not.toBeNull();
    expect(fuzzyScore("ldp", "scripts/deployLock.js")).toBeNull();
  });

  it("ignores case and surrounding spaces", () => {
    expect(fuzzyScore("  READme ", "readme.md")).not.toBeNull();
  });

  it("matches everything for an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("fuzzyFilter", () => {
  it("drops files that do not match and ranks the exact extension first", () => {
    const result = paths(fuzzyFilter(files, "sol"));
    expect(result.slice(0, 2).sort()).toEqual(["contracts/Greeter.sol", "contracts/Lock.sol"]);
    expect(result).not.toContain("package.json");
    expect(result).not.toContain("README.md");
  });

  it("prefers a match in the file name over one in the folder", () => {
    const result = fuzzyFilter(
      [{ path: "lock/readme.md" }, { path: "docs/lock.md" }],
      "lock",
    );
    expect(paths(result)[0]).toBe("docs/lock.md");
  });

  it("puts the closest, shortest name first", () => {
    const result = fuzzyFilter([{ path: "src/deep/main.py" }, { path: "main.py" }], "main");
    expect(paths(result)).toEqual(["main.py", "src/deep/main.py"]);
  });

  it("finds a file by the first letters of its words", () => {
    expect(paths(fuzzyFilter(files, "dl"))[0]).toBe("scripts/deployLock.js");
  });

  it("returns nothing when nothing matches", () => {
    expect(fuzzyFilter(files, "zzz")).toEqual([]);
  });
});
