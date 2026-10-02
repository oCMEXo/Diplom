import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type {
  ServerMetrics,
  SyncClient,
  SystemDefinition,
  TrafficCounters,
} from "./adapters/types.js";
import type { ServerResponse } from "./servers/protocol.js";
import { sleep } from "./stats.js";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const benchDir = path.resolve(srcDir, "..");

export interface ServerHandle {
  url: string;
  ask<T>(type: "metrics" | "docsize"): Promise<T>;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

export async function startServer(system: SystemDefinition): Promise<ServerHandle> {
  const port = await freePort();
  const child: ChildProcess = fork(path.join(srcDir, system.serverEntry), [], {
    cwd: benchDir,
    execArgv: ["--import", "tsx"],
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  const pending = new Map<number, (value: unknown) => void>();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`server exited early (${code})`)));
    child.on("message", (message: { type?: string } & Partial<ServerResponse>) => {
      if (message.type === "ready") resolve();
      else if (typeof message.id === "number") pending.get(message.id)?.(message.result);
    });
  });
  child.removeAllListeners("exit");

  return {
    url: `ws://127.0.0.1:${port}`,
    ask<T>(type: "metrics" | "docsize") {
      return new Promise<T>((resolve) => {
        const id = nextId++;
        pending.set(id, (value) => {
          pending.delete(id);
          resolve(value as T);
        });
        child.send({ id, type });
      });
    },
    async stop() {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill();
      await exited;
    },
  };
}

export class ServerSampler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private start: ServerMetrics | undefined;
  private startedAt = 0;
  peakRssBytes = 0;

  constructor(private readonly server: ServerHandle) {}

  async begin() {
    this.start = await this.server.ask<ServerMetrics>("metrics");
    this.startedAt = performance.now();
    this.peakRssBytes = this.start.rssBytes;
    this.timer = setInterval(async () => {
      const sample = await this.server.ask<ServerMetrics>("metrics");
      this.peakRssBytes = Math.max(this.peakRssBytes, sample.rssBytes);
    }, 250);
  }

  async end() {
    clearInterval(this.timer);
    const finish = await this.server.ask<ServerMetrics>("metrics");
    this.peakRssBytes = Math.max(this.peakRssBytes, finish.rssBytes);
    const wallMs = performance.now() - this.startedAt;
    const cpuMs =
      (finish.cpuUserMicros + finish.cpuSystemMicros - this.start!.cpuUserMicros - this.start!.cpuSystemMicros) /
      1000;
    return { cpuPercent: (cpuMs / wallMs) * 100, peakRssMb: this.peakRssBytes / 1024 / 1024 };
  }
}

export class EventLoopProbe {
  private readonly histogram = monitorEventLoopDelay({ resolution: 10 });

  begin() {
    this.histogram.reset();
    this.histogram.enable();
  }

  end() {
    this.histogram.disable();
    return {
      meanMs: this.histogram.mean / 1e6,
      p99Ms: this.histogram.percentile(99) / 1e6,
    };
  }
}

export interface ClientSet {
  clients: SyncClient[];
  traffic: TrafficCounters[];
  resetTraffic(): void;
  totalTraffic(): number;
  closeAll(): Promise<void>;
}

export async function connectClients(
  system: SystemDefinition,
  server: ServerHandle,
  count: number,
): Promise<ClientSet> {
  const traffic: TrafficCounters[] = Array.from({ length: count }, () => ({ bytesIn: 0, bytesOut: 0 }));
  const clients = traffic.map((counters, index) =>
    system.connect(server.url, `c${String(index).padStart(3, "0")}`, counters),
  );
  await Promise.all(clients.map((client) => client.ready()));
  return {
    clients,
    traffic,
    resetTraffic() {
      for (const counters of traffic) {
        counters.bytesIn = 0;
        counters.bytesOut = 0;
      }
    },
    totalTraffic() {
      return traffic.reduce((sum, counters) => sum + counters.bytesIn + counters.bytesOut, 0);
    },
    async closeAll() {
      await Promise.all(clients.map((client) => client.close()));
    },
  };
}

export const TOKEN_PATTERN = /<c\d+\.\d+>/g;

export function countTokens(text: string): number {
  return text.match(TOKEN_PATTERN)?.length ?? 0;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  pollMs = 10,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return true;
    await sleep(pollMs);
  }
  return predicate();
}
