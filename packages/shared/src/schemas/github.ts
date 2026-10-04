import { z } from "zod";

export const pushGithubSchema = z.object({
  /** A GitHub personal access token with write access to the repository; used once and never stored. */
  token: z.string().trim().min(10).max(255).regex(/^\S+$/, "Token must not contain spaces"),
  message: z.string().trim().min(1).max(500),
  /** Branch to commit to; created from the project's branch if it does not exist. Default: the linked branch. */
  branch: z.string().trim().max(200).optional(),
  /** Needed only when the project is not linked to a repository yet. */
  repoUrl: z.string().trim().max(300).optional(),
  /** Replace files that changed on GitHub since they were imported. */
  overwrite: z.boolean().optional(),
});
export type PushGithubInput = z.infer<typeof pushGithubSchema>;

export const pushResultSchema = z.object({
  repo: z.object({ owner: z.string(), name: z.string() }),
  branch: z.string(),
  newBranch: z.boolean(),
  commitSha: z.string(),
  commitUrl: z.string(),
  added: z.number().int(),
  modified: z.number().int(),
  unchanged: z.number().int(),
});
export type PushResult = z.infer<typeof pushResultSchema>;
