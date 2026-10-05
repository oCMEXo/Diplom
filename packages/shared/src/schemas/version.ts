import { z } from "zod";

/** An earlier state of a code or Markdown file, as listed in its history (without the text). */
export const fileVersionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  /** Bytes of the UTF-8 text. */
  size: z.number().int().nonnegative(),
  /** Whose edit was being saved when the version was taken; null if unknown. */
  authorName: z.string().nullable(),
});
export type FileVersion = z.infer<typeof fileVersionSchema>;

export const fileVersionContentSchema = fileVersionSchema.extend({ content: z.string() });
export type FileVersionContent = z.infer<typeof fileVersionContentSchema>;
