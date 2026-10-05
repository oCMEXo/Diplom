import { z } from "zod";

/** Caps for "find in project", so a common word in a big repository cannot produce a huge answer. */
export const SEARCH_LIMITS = {
  minQuery: 2,
  maxQuery: 200,
  matchesPerFile: 50,
  totalMatches: 500,
  previewChars: 200,
} as const;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_LIMITS.minQuery).max(SEARCH_LIMITS.maxQuery),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchMatchSchema = z.object({
  /** 1-based, as the editor counts lines and columns. */
  line: z.number().int(),
  column: z.number().int(),
  length: z.number().int(),
  /** The line around the match, cut to a readable size; `previewOffset` is where the match starts in it (0-based). */
  preview: z.string(),
  previewOffset: z.number().int(),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const searchFileResultSchema = z.object({
  fileId: z.string().uuid(),
  path: z.string(),
  matches: z.array(searchMatchSchema),
});
export type SearchFileResult = z.infer<typeof searchFileResultSchema>;

export const searchResultSchema = z.object({
  files: z.array(searchFileResultSchema),
  /** Some matches were left out because of the limits. */
  truncated: z.boolean(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
