import { runJobSchema } from "@collab/shared";
import type { RunEvent } from "@collab/shared";
import { runInSandbox, type ExecutionResult } from "./executor.js";

export type Publish = (event: RunEvent) => Promise<unknown> | unknown;
export type Executor = typeof runInSandbox;

export async function processRunJob(
  data: unknown,
  publish: Publish,
  execute: Executor = runInSandbox,
): Promise<ExecutionResult> {
  const job = runJobSchema.parse(data);
  const ref = { runId: job.runId, projectId: job.projectId, fileId: job.fileId };

  await publish({
    type: "run.started",
    ...ref,
    language: job.language,
    startedBy: job.startedBy,
  });

  const pending: Promise<unknown>[] = [];
  const result = await execute(job, (stream, chunk) => {
    pending.push(Promise.resolve(publish({ type: "run.output", ...ref, stream, chunk })));
  });
  await Promise.all(pending);

  await publish({
    type: "run.finished",
    ...ref,
    status: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    errorLine: result.errorLine,
    truncated: result.truncated,
  });

  return result;
}
