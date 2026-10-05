import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import { TERMINAL_WORKDIR } from "@collab/shared";
import { buildTar, type TarFile } from "../tar.js";
import { TERMINAL_IMAGE } from "./image.js";

export const TERMINAL_LIMITS = {
  memoryBytes: 256 * 1024 * 1024,
  nanoCpus: 500_000_000,
  pids: 128,
  projectTmpfs: "64m",
  tmpTmpfs: "32m",
} as const;

export const TERMINAL_LABEL = "collab.terminal";

export interface TerminalSessionOptions {
  files: TarFile[];
  userName: string;
  cols: number;
  rows: number;
  /** The container stops by itself after this long, even if nobody closes the session. */
  maxMs: number;
  onOutput: (data: string) => void;
  onExit: (message: string) => void;
}

export interface TerminalSession {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(message?: string): void;
}

/** Letters, digits and a few signs: the name only decorates the prompt. */
export function promptName(name: string) {
  const clean = name.normalize("NFC").replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "");
  return clean.slice(0, 24) || "user";
}

/** The container settings: no network, a read-only system, small memory, and nothing to escalate. */
export function terminalContainerConfig(name: string, userName: string, maxMs: number): Docker.ContainerCreateOptions {
  return {
    name,
    Image: TERMINAL_IMAGE,
    // Sleeping is the container's whole life: shells come and go as `exec`s; when it ends, all of it ends.
    Cmd: ["sleep", String(Math.ceil(maxMs / 1000))],
    User: "65534:65534",
    WorkingDir: TERMINAL_WORKDIR,
    Env: [`COLLAB_USER=${promptName(userName)}`],
    Labels: { [TERMINAL_LABEL]: "1" },
    HostConfig: {
      AutoRemove: true,
      Init: true,
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Tmpfs: {
        [TERMINAL_WORKDIR]: `rw,exec,size=${TERMINAL_LIMITS.projectTmpfs},uid=65534,gid=65534,mode=0755`,
        "/tmp": `rw,exec,size=${TERMINAL_LIMITS.tmpTmpfs},mode=1777`,
      },
      Memory: TERMINAL_LIMITS.memoryBytes,
      MemorySwap: TERMINAL_LIMITS.memoryBytes,
      NanoCpus: TERMINAL_LIMITS.nanoCpus,
      PidsLimit: TERMINAL_LIMITS.pids,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
    },
  };
}

async function waitForExec(exec: Docker.Exec, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const info = await exec.inspect();
    if (!info.Running) return info.ExitCode;
    if (Date.now() > deadline) throw new Error("exec did not finish");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Unpacks the project into the container's tmpfs through the exec's stdin; nothing touches the host disk. */
async function copyFiles(container: Docker.Container, files: TarFile[]) {
  if (files.length === 0) return;
  const exec = await container.exec({
    Cmd: ["tar", "-xmf", "-", "-C", TERMINAL_WORKDIR],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: true });
  stream.resume();
  const ended = new Promise((resolve) => stream.on("end", resolve).on("close", resolve).on("error", resolve));
  stream.end(buildTar(files));
  await ended;
  const code = await waitForExec(exec);
  if (code !== 0) throw new Error(`copying files failed (${code})`);
}

/**
 * Starts a sandbox container with the project's files and a bash attached to a real terminal (TTY),
 * so colours, line editing, Ctrl+C and full-screen programs behave as in Git Bash.
 */
export async function openTerminalSession(docker: Docker, options: TerminalSessionOptions): Promise<TerminalSession> {
  const container = await docker.createContainer(
    terminalContainerConfig(`collab-term-${randomUUID()}`, options.userName, options.maxMs),
  );
  let closed = false;
  let shell: Duplex | null = null;
  let timer: NodeJS.Timeout | undefined;

  const close = (message = "Сеанс завершён.") => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    shell?.destroy();
    container.kill().catch(() => undefined);
    options.onExit(message);
  };

  try {
    await container.start();
    await copyFiles(container, options.files);
    const exec = await container.exec({
      Cmd: ["bash", "--rcfile", "/etc/collab.bashrc", "-i"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: TERMINAL_WORKDIR,
    });
    shell = await exec.start({ hijack: true, stdin: true, Tty: true });
    await exec.resize({ w: options.cols, h: options.rows }).catch(() => undefined);

    // A chunk can end in the middle of a multi-byte letter; the streaming decoder keeps the tail.
    const decoder = new TextDecoder();
    shell.on("data", (chunk: Buffer) => {
      const text = decoder.decode(chunk, { stream: true });
      if (text) options.onOutput(text);
    });
    shell.on("end", () => close("Командная строка закрыта (exit)."));
    shell.on("error", () => close("Связь с песочницей прервалась."));
    timer = setTimeout(() => close(`Сеанс длится не дольше ${Math.round(options.maxMs / 60_000)} минут.`), options.maxMs);
    timer.unref();

    return {
      write: (data) => {
        if (!closed) shell?.write(data);
      },
      resize: (cols, rows) => {
        if (!closed) exec.resize({ w: cols, h: rows }).catch(() => undefined);
      },
      close,
    };
  } catch (error) {
    closed = true;
    container.kill().catch(() => undefined);
    container.remove({ force: true }).catch(() => undefined);
    throw error;
  }
}
