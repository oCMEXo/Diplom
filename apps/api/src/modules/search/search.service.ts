import { prisma } from "@collab/db";
import { SEARCH_LIMITS, type SearchMatch, type SearchResult } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { activeBranch } from "../../lib/branch.js";
import { yjsStateToText } from "../../lib/yjs-text.js";

/** The query is plain text: characters like "." or "(" mean themselves. */
function plainTextPattern(query: string): RegExp {
  // The regex engine's case folding keeps indexes in the original line, which lowercasing both sides would not.
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
}

/** A long line (minified code) is cut to a window around the match so the result stays readable. */
function previewOf(text: string, index: number, length: number): { preview: string; previewOffset: number } {
  const indent = text.length - text.trimStart().length;
  const line = text.trim();
  const at = index - indent;
  if (line.length <= SEARCH_LIMITS.previewChars) return { preview: line, previewOffset: at };

  const start = Math.max(0, Math.min(at - 60, line.length - SEARCH_LIMITS.previewChars));
  const end = Math.min(line.length, Math.max(start + SEARCH_LIMITS.previewChars, at + length));
  const head = start > 0 ? "…" : "";
  const tail = end < line.length ? "…" : "";
  return { preview: head + line.slice(start, end) + tail, previewOffset: head.length + at - start };
}

function findMatches(text: string, pattern: RegExp, limit: number): { matches: SearchMatch[]; more: boolean } {
  const matches: SearchMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    for (const found of line.matchAll(pattern)) {
      if (matches.length === limit) return { matches, more: true };
      matches.push({
        line: index + 1,
        column: found.index + 1,
        length: found[0].length,
        ...previewOf(line, found.index, found[0].length),
      });
    }
  }
  return { matches, more: false };
}

/**
 * "Find in project": a case-insensitive plain-text search over the text files of the active branch.
 * Contents live only as Yjs state, so every file is decoded here; dependencies (node_modules) are
 * skipped because they would drown the project's own code.
 */
export async function searchProject(userId: string, projectId: string, rawQuery: string): Promise<SearchResult> {
  await requireProjectRole(projectId, userId, "viewer");
  const query = rawQuery.trim();
  if (query.length < SEARCH_LIMITS.minQuery || query.length > SEARCH_LIMITS.maxQuery) {
    throw new AppError(`Для поиска введите от ${SEARCH_LIMITS.minQuery} до ${SEARCH_LIMITS.maxQuery} символов`, 400);
  }

  const files = await prisma.file.findMany({
    where: {
      projectId,
      branch: await activeBranch(projectId),
      deletedAt: null,
      type: { not: "board" },
      NOT: { path: { contains: "node_modules" } },
    },
    select: { id: true, path: true, yjsState: true },
    orderBy: { path: "asc" },
  });

  const pattern = plainTextPattern(query);
  const result: SearchResult = { files: [], truncated: false };
  let left: number = SEARCH_LIMITS.totalMatches;
  for (const file of files) {
    if (left === 0) {
      // Only report truncation if a skipped file really had something to show.
      // `search` ignores the pattern's lastIndex, unlike `test` on a global regex.
      if (yjsStateToText(file.yjsState).search(pattern) !== -1) {
        result.truncated = true;
        break;
      }
      continue;
    }
    const limit = Math.min(SEARCH_LIMITS.matchesPerFile, left);
    const { matches, more } = findMatches(yjsStateToText(file.yjsState), pattern, limit);
    if (more) result.truncated = true;
    if (matches.length === 0) continue;
    result.files.push({ fileId: file.id, path: file.path, matches });
    left -= matches.length;
  }
  return result;
}
