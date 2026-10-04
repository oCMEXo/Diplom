import { z } from "zod";

export const importGithubSchema = z.object({
  url: z.string().trim().min(3).max(300),
});
export type ImportGithubInput = z.infer<typeof importGithubSchema>;

export const importResultSchema = z.object({
  repo: z.object({ owner: z.string(), name: z.string(), ref: z.string().nullable() }),
  imported: z.number().int(),
  skipped: z.object({
    existing: z.number().int(),
    ignored: z.number().int(),
    binary: z.number().int(),
    tooLarge: z.number().int(),
    overLimit: z.number().int(),
  }),
});
export type ImportResult = z.infer<typeof importResultSchema>;
