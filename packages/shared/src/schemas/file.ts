import { z } from "zod";
import { FILE_TYPES } from "../constants.js";

export const fileTypeSchema = z.enum(FILE_TYPES);

const filePath = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^/].*[^/]$|^[^/]$/, "Path must not start or end with a slash")
  .refine((p) => !p.includes(".."), "Path must not contain '..'");

export const createFileSchema = z.object({
  path: filePath,
  type: fileTypeSchema.default("code"),
  language: z.string().max(50).optional(),
});
export type CreateFileInput = z.infer<typeof createFileSchema>;

export const updateFileSchema = z.object({
  path: filePath.optional(),
  language: z.string().max(50).nullable().optional(),
});
export type UpdateFileInput = z.infer<typeof updateFileSchema>;

export const fileSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  path: z.string(),
  type: fileTypeSchema,
  language: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type FileRecord = z.infer<typeof fileSchema>;
