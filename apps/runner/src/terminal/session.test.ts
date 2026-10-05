import Docker from "dockerode";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureTerminalImage } from "./image.js";
import { openTerminalSession, promptName, terminalContainerConfig, type TerminalSession } from "./session.js";

describe("terminal container settings", () => {
  it("keeps the sandbox closed: no network, read-only system, limits, nobody user", () => {
    const config = terminalContainerConfig("t", "Аня", 30 * 60_000);
    expect(config.User).toBe("65534:65534");
    expect(config.Cmd).toEqual(["sleep", "1800"]);
    expect(config.HostConfig).toMatchObject({
      AutoRemove: true,
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Memory: 256 * 1024 * 1024,
      MemorySwap: 256 * 1024 * 1024,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
    });
  });

  it("makes a prompt-friendly name", () => {
    expect(promptName("Аня")).toBe("Аня");
    expect(promptName("Иван Петров")).toBe("Иван_Петров");
    expect(promptName("$(rm -rf /)")).toBe("rm_-rf");
    expect(promptName("   ")).toBe("user");
  });
});

describe("terminal session in a real container", () => {
  const docker = new Docker();

  beforeAll(async () => {
    await ensureTerminalImage(docker);
  }, 300_000);

  async function open(files: { path: string; content: string }[]) {
    let output = "";
    let exit: string | null = null;
    const session: TerminalSession = await openTerminalSession(docker, {
      files,
      userName: "Аня",
      cols: 100,
      rows: 30,
      maxMs: 60_000,
      onOutput: (data) => (output += data),
      onExit: (message) => (exit = message),
    });
    const waitFor = async (check: () => boolean, ms = 20_000) => {
      const deadline = Date.now() + ms;
      while (!check()) {
        if (Date.now() > deadline) throw new Error(`timed out; output so far:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    return { session, waitFor, output: () => output, exit: () => exit };
  }

  it("runs the project's own files with node and python in a bash with a real terminal", async () => {
    const term = await open([
      { path: "main.js", content: "console.log(require('./lib/greet')('мир'))" },
      { path: "lib/greet.js", content: "module.exports = (who) => `привет, ${who}`" },
      { path: "app.py", content: "print(sum(range(10)))" },
    ]);
    await term.waitFor(() => term.output().includes("Аня@collab"));
    term.session.write("node main.js && python app.py && stty size && pwd\r");
    await term.waitFor(() => /привет, мир[\s\S]*45[\s\S]*30 100[\s\S]*\/project/.test(term.output()));
    term.session.write("exit\r");
    await term.waitFor(() => term.exit() !== null);
    expect(term.exit()).toBe("Командная строка закрыта (exit).");
  }, 60_000);

  it("has no network and cannot write outside its own folders", async () => {
    const term = await open([]);
    await term.waitFor(() => term.output().includes("$ "));
    term.session.write(
      "node -e \"require('net').connect(80,'1.1.1.1').on('error',e=>console.log('NET',e.code))\"; touch /etc/x 2>&1 | head -c 60; echo; whoami\r",
    );
    await term.waitFor(() => /NET (ENETUNREACH|EHOSTUNREACH|ECONNREFUSED)/.test(term.output()) && term.output().includes("nobody"));
    expect(term.output()).toMatch(/Read-only file system|Permission denied/);
    term.session.close();
  }, 60_000);

  it("Ctrl+C stops a running program and the shell stays", async () => {
    const term = await open([{ path: "loop.js", content: "setInterval(() => {}, 1000)" }]);
    await term.waitFor(() => term.output().includes("$ "));
    term.session.write("node loop.js\r");
    await new Promise((resolve) => setTimeout(resolve, 800));
    term.session.write("\x03");
    term.session.write("echo still-here\r");
    await term.waitFor(() => term.output().includes("still-here\r\n"));
    term.session.close("bye");
    expect(term.exit()).toBe("bye");
  }, 60_000);
});
