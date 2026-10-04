import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { MAX_RUN_OUTPUT_BYTES, RUN_TIMEOUT_MS } from "@collab/shared";
import type { RunJob, RunStatus } from "@collab/shared";
import { buildDockerArgs, containerName, entryFile, parseErrorLine } from "./sandbox.js";
import { buildTar } from "./tar.js";

export interface ExecutionResult {
  status: RunStatus;
  exitCode: number | null;
  durationMs: number;
  errorLine: number | null;
  truncated: boolean;
}

export type OutputHandler = (stream: "stdout" | "stderr", chunk: string) => void;

const DOCKER_ERROR_EXIT = 125;
const STDERR_SCAN_LIMIT = 16 * 1024;

export function runInSandbox(
  job: Pick<RunJob, "runId" | "language" | "code"> & Partial<Pick<RunJob, "entry" | "files">>,
  onOutput: OutputHandler,
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("docker", buildDockerArgs(job.language, job.runId, job.entry), {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let emittedBytes = 0;
    let truncated = false;
    let timedOut = false;
    let stderrTail = "";
    let settled = false;

    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };

    function emit(stream: "stdout" | "stderr", buffer: Buffer) {
      let slice = buffer;
      const remaining = MAX_RUN_OUTPUT_BYTES - emittedBytes;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (buffer.length > remaining) {
        slice = buffer.subarray(0, remaining);
        truncated = true;
      }
      emittedBytes += slice.length;
      const text = decoders[stream].write(slice);
      if (text) onOutput(stream, text);
      if (stream === "stderr" && stderrTail.length < STDERR_SCAN_LIMIT) {
        stderrTail += text;
      }
    }

    child.stdout.on("data", (buffer: Buffer) => emit("stdout", buffer));
    child.stderr.on("data", (buffer: Buffer) => emit("stderr", buffer));

    const timer = setTimeout(() => {
      timedOut = true;
      spawn("docker", ["kill", containerName(job.runId)], { stdio: "ignore" });
    }, timeoutMs);

    function finish(exitCode: number | null, spawnFailed: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;

      let status: RunStatus;
      if (spawnFailed || exitCode === DOCKER_ERROR_EXIT) status = "failed";
      else if (timedOut) status = "timeout";
      else if (exitCode === 0) status = "ok";
      else status = "error";

      resolve({
        status,
        exitCode,
        durationMs,
        errorLine: status === "error" ? parseErrorLine(job.language, stderrTail, job.entry) : null,
        truncated,
      });
    }

    child.on("error", (error) => {
      onOutput("stderr", `Не удалось запустить docker: ${error.message}\n`);
      finish(null, true);
    });
    child.on("close", (code) => finish(code, false));

    child.stdin.on("error", () => undefined);
    // The project is sent as a tar archive on stdin; the entry file is the editor's current text.
    const entry = entryFile(job.language, job.entry);
    child.stdin.end(
      buildTar([...(job.files ?? []).filter((file) => file.path !== entry), { path: entry, content: job.code }]),
    );
  });
}
