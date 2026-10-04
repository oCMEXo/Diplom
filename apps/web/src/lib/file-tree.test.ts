import { describe, expect, it } from "vitest";
import type { FileRecord } from "@collab/shared";
import { ancestorDirs, buildFileTree, type TreeNode } from "./file-tree";

const file = (path: string): FileRecord => ({
  id: path,
  projectId: "p",
  path,
  type: "code",
  language: null,
  updatedAt: "2026-10-04T00:00:00.000Z",
});

/** A compact view of the tree for assertions: folders end with "/", children are nested. */
function outline(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === "dir" ? { [`${node.name}/`]: outline(node.children) } : node.name));
}

describe("buildFileTree", () => {
  it("nests files under their folders, folders first", () => {
    const tree = buildFileTree(
      ["package.json", "contracts/Lock.sol", "scripts/deploy.js", ".gitignore", "contracts/Greeter.sol"].map(file),
    );
    expect(outline(tree)).toEqual([
      { "contracts/": ["Greeter.sol", "Lock.sol"] },
      { "scripts/": ["deploy.js"] },
      ".gitignore",
      "package.json",
    ]);
  });

  it("handles folders several levels deep and shared parents", () => {
    const tree = buildFileTree(["logs/2025/a.log", "logs/2025/b.log", "logs/readme.txt"].map(file));
    expect(outline(tree)).toEqual([{ "logs/": [{ "2025/": ["a.log", "b.log"] }, "readme.txt"] }]);
  });

  it("sorts numbers naturally", () => {
    const tree = buildFileTree(["f10.txt", "f2.txt", "f1.txt"].map(file));
    expect(outline(tree)).toEqual(["f1.txt", "f2.txt", "f10.txt"]);
  });

  it("keeps the original file record on file nodes", () => {
    const [node] = buildFileTree([file("a/b.txt")]);
    const child = node?.kind === "dir" ? node.children[0] : undefined;
    expect(child?.kind === "file" && child.file.id).toBe("a/b.txt");
  });

  it("gives an empty tree for no files", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("ancestorDirs", () => {
  it("lists the folders above a file", () => {
    expect(ancestorDirs("a/b/c.js")).toEqual(["a", "a/b"]);
    expect(ancestorDirs("top.js")).toEqual([]);
  });
});
