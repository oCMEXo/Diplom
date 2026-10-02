import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runInSandbox } from "./executor.js";

function dockerReady() {
  try {
    execFileSync("docker", ["image", "inspect", "node:22-alpine", "python:3.12-alpine"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const suite = dockerReady() ? describe : describe.skip;

async function run(language: "javascript" | "python", code: string, timeoutMs?: number) {
  const out: string[] = [];
  const err: string[] = [];
  const result = await runInSandbox(
    { runId: randomUUID(), language, code },
    (stream, chunk) => (stream === "stdout" ? out : err).push(chunk),
    timeoutMs,
  );
  return { result, stdout: out.join(""), stderr: err.join("") };
}

suite("runInSandbox (real docker)", () => {
  it("runs python and captures stdout", async () => {
    const { result, stdout } = await run("python", "print('hi', 2 + 2)");
    expect(result).toMatchObject({ status: "ok", exitCode: 0 });
    expect(stdout).toBe("hi 4\n");
  });

  it("runs javascript and captures stdout", async () => {
    const { result, stdout } = await run("javascript", "console.log([1,2,3].map(x => x * 2).join())");
    expect(result.status).toBe("ok");
    expect(stdout).toBe("2,4,6\n");
  });

  it("reports the error line of a python exception", async () => {
    const { result, stderr } = await run("python", "x = 1\ny = 2\nprint(1 / 0)\n");
    expect(result).toMatchObject({ status: "error", exitCode: 1, errorLine: 3 });
    expect(stderr).toContain("ZeroDivisionError");
  });

  it("reports the error line of a javascript exception", async () => {
    const { result } = await run("javascript", "const a = 1;\n\nthrow new Error('boom');\n");
    expect(result).toMatchObject({ status: "error", errorLine: 3 });
  });

  it("kills runaway code at the timeout", async () => {
    const { result } = await run("python", "while True: pass", 2500);
    expect(result.status).toBe("timeout");
    expect(result.durationMs).toBeLessThan(15000);
  });

  it("has no network access", async () => {
    const { result, stdout } = await run(
      "python",
      "import socket\ntry:\n    socket.create_connection(('1.1.1.1', 53), timeout=3)\n    print('connected')\nexcept OSError:\n    print('blocked')\n",
    );
    expect(result.status).toBe("ok");
    expect(stdout.trim()).toBe("blocked");
  });

  it("cannot write to the root filesystem", async () => {
    const { stdout } = await run(
      "python",
      "try:\n    open('/etc/pwned', 'w')\n    print('written')\nexcept OSError:\n    print('read-only')\n",
    );
    expect(stdout.trim()).toBe("read-only");
  });

  it("runs as an unprivileged user", async () => {
    const { stdout } = await run("python", "import os\nprint(os.getuid())");
    expect(stdout.trim()).toBe("65534");
  });

  it("truncates huge output", async () => {
    const { result, stdout } = await run("python", "print('x' * 200000)");
    expect(result.truncated).toBe(true);
    expect(stdout.length).toBeLessThanOrEqual(64 * 1024);
  });
});
