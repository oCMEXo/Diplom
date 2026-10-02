import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@collab/shared";
import { processRunJob, type Executor } from "./worker.js";

function job(overrides: Record<string, unknown> = {}) {
  return {
    runId: randomUUID(),
    projectId: randomUUID(),
    fileId: randomUUID(),
    language: "python",
    code: "print(1)",
    startedBy: { id: randomUUID(), name: "Аня" },
    ...overrides,
  };
}

describe("processRunJob", () => {
  it("publishes started, output chunks in order, then finished", async () => {
    const events: RunEvent[] = [];
    const execute: Executor = async (_job, onOutput) => {
      onOutput("stdout", "hello\n");
      onOutput("stderr", "warn\n");
      return { status: "ok", exitCode: 0, durationMs: 12, errorLine: null, truncated: false };
    };

    await processRunJob(job(), (event) => void events.push(event), execute);

    expect(events.map((e) => e.type)).toEqual(["run.started", "run.output", "run.output", "run.finished"]);
    expect(events[1]).toMatchObject({ stream: "stdout", chunk: "hello\n" });
    expect(events[3]).toMatchObject({ status: "ok", exitCode: 0, durationMs: 12 });
  });

  it("carries the error line through to the finished event", async () => {
    const events: RunEvent[] = [];
    const execute: Executor = async () => ({
      status: "error",
      exitCode: 1,
      durationMs: 5,
      errorLine: 7,
      truncated: false,
    });

    await processRunJob(job(), (event) => void events.push(event), execute);
    expect(events.at(-1)).toMatchObject({ type: "run.finished", status: "error", errorLine: 7 });
  });

  it("rejects malformed job data instead of running it", async () => {
    await expect(processRunJob({ code: "x" }, () => undefined)).rejects.toThrow();
  });

  it("refuses languages that are not whitelisted", async () => {
    await expect(processRunJob(job({ language: "bash" }), () => undefined)).rejects.toThrow();
  });
});
