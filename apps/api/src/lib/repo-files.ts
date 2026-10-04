import { unzipSync } from "fflate";
import { IMPORT_LIMITS, inferLanguage, type FileType, type ImportResult } from "@collab/shared";
import { AppError } from "./errors.js";

export interface RepoFile {
  path: string;
  text: string;
  type: FileType;
  language: string | null;
}

export type SkipCounts = ImportResult["skipped"];

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
]);
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock"]);
const MAX_PATH_LENGTH = 500;
const MAX_SKIPPED_NAMES = 12;

function isIgnored(path: string) {
  const parts = path.split("/");
  const name = parts[parts.length - 1]!;
  return (
    parts.slice(0, -1).some((part) => IGNORED_DIRS.has(part)) ||
    IGNORED_FILES.has(name) ||
    /\.min\.(js|css)$/i.test(name) ||
    /\.map$/i.test(name)
  );
}

/** Files inside an ignored folder are reported as the folder ("node_modules/"), not one by one. */
function skipLabel(path: string) {
  const parts = path.split("/");
  const index = parts.slice(0, -1).findIndex((part) => IGNORED_DIRS.has(part));
  return index === -1 ? path : `${parts.slice(0, index + 1).join("/")}/`;
}

function isSafePath(path: string) {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH_LENGTH &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.subarray(0, 8000).includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** GitHub archives wrap everything in one `<repo>-<ref>/` folder; the files should not carry it. */
function stripRoot(name: string) {
  const index = name.indexOf("/");
  return index === -1 ? name : name.slice(index + 1);
}

/**
 * Picks the text files worth importing from a repository archive: no build output, lockfiles or
 * binaries, nothing above the size limits. Shallow files win when the file limit is reached.
 */
export function extractRepoFiles(zip: Uint8Array): {
  files: RepoFile[];
  skipped: Omit<SkipCounts, "existing">;
  skippedPaths: string[];
} {
  const skipped = { ignored: 0, binary: 0, tooLarge: 0, overLimit: 0 };
  const skippedPaths = new Set<string>();
  const candidates: { entry: string; path: string; size: number }[] = [];

  try {
    // First pass only reads the archive's file list; no entry is decompressed.
    unzipSync(zip, {
      filter(file) {
        if (file.name.endsWith("/")) return false;
        const path = stripRoot(file.name);
        if (!isSafePath(path) || isIgnored(path)) {
          skipped.ignored += 1;
          skippedPaths.add(skipLabel(path));
        } else if (file.originalSize > IMPORT_LIMITS.maxFileBytes) {
          skipped.tooLarge += 1;
          skippedPaths.add(path);
        } else {
          candidates.push({ entry: file.name, path, size: file.originalSize });
        }
        return false;
      },
    });
  } catch {
    throw new AppError("Не удалось прочитать архив репозитория.", 422);
  }

  candidates.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));

  const chosen = new Map<string, string>();
  let total = 0;
  for (const candidate of candidates) {
    if (chosen.size >= IMPORT_LIMITS.maxFiles || total + candidate.size > IMPORT_LIMITS.maxTotalBytes) {
      skipped.overLimit += 1;
      continue;
    }
    chosen.set(candidate.entry, candidate.path);
    total += candidate.size;
  }

  let contents: Record<string, Uint8Array>;
  try {
    contents = unzipSync(zip, { filter: (file) => chosen.has(file.name) });
  } catch {
    throw new AppError("Не удалось прочитать архив репозитория.", 422);
  }

  const files: RepoFile[] = [];
  for (const [entry, path] of chosen) {
    const bytes = contents[entry];
    const text = bytes ? decodeText(bytes) : null;
    if (text === null) {
      skipped.binary += 1;
      skippedPaths.add(path);
      continue;
    }
    const isMarkdown = /\.(md|markdown)$/i.test(path);
    files.push({
      path,
      text,
      type: isMarkdown ? "doc" : "code",
      language: isMarkdown ? "markdown" : inferLanguage(path),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, skippedPaths: [...skippedPaths].slice(0, MAX_SKIPPED_NAMES) };
}
