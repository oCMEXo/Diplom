import { z } from "zod";
import { RUNNABLE_LANGUAGES } from "../constants.js";

export const RUN_QUEUE_NAME = "code-runs";
export const RUN_EVENTS_CHANNEL = "run-events";
export const RUN_TIMEOUT_MS = 10_000;
export const MAX_RUN_OUTPUT_BYTES = 64 * 1024;
export const MAX_RUN_CODE_CHARS = 100_000;

export const runnableLanguageSchema = z.enum(RUNNABLE_LANGUAGES);

export const runRequestSchema = z.object({
  code: z.string().max(MAX_RUN_CODE_CHARS),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runAcceptedSchema = z.object({ runId: z.string().uuid() });

export const runJobSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
  language: runnableLanguageSchema,
  code: z.string(),
  startedBy: z.object({ id: z.string().uuid(), name: z.string() }),
});
export type RunJob = z.infer<typeof runJobSchema>;

const runRef = {
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
};

export const runStatusSchema = z.enum(["ok", "error", "timeout", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runStartedEventSchema = z.object({
  type: z.literal("run.started"),
  ...runRef,
  language: runnableLanguageSchema,
  startedBy: z.object({ id: z.string().uuid(), name: z.string() }),
});

export const runOutputEventSchema = z.object({
  type: z.literal("run.output"),
  ...runRef,
  stream: z.enum(["stdout", "stderr"]),
  chunk: z.string(),
});

export const runFinishedEventSchema = z.object({
  type: z.literal("run.finished"),
  ...runRef,
  status: runStatusSchema,
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  errorLine: z.number().int().positive().nullable(),
  truncated: z.boolean(),
});

export const runEventSchema = z.discriminatedUnion("type", [
  runStartedEventSchema,
  runOutputEventSchema,
  runFinishedEventSchema,
]);
export type RunEvent = z.infer<typeof runEventSchema>;
