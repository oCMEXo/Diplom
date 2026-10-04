import type { FileRecord } from "@collab/shared";

export type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; file: FileRecord };

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** Folders first, then files, each in natural order (file2 before file10). */
function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === "dir" ? -1 : 1));
  for (const node of nodes) if (node.kind === "dir") sortNodes(node.children);
}

/** Turns flat file paths ("scripts/deploy.js") into a nested folder tree. */
export function buildFileTree(files: FileRecord[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let level = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const path = parts.slice(0, index + 1).join("/");
      let dir = level.find((node) => node.kind === "dir" && node.path === path);
      if (!dir) {
        dir = { kind: "dir", name: parts[index]!, path, children: [] };
        level.push(dir);
      }
      level = (dir as Extract<TreeNode, { kind: "dir" }>).children;
    }
    level.push({ kind: "file", name: parts[parts.length - 1]!, file });
  }
  sortNodes(root);
  return root;
}

/** Folder paths that contain the given file, outermost first: "a/b/c.js" -> ["a", "a/b"]. */
export function ancestorDirs(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}
