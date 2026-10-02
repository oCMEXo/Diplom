import path from "node:path";
import { fileURLToPath } from "node:url";
import { fork, type ChildProcess } from "node:child_process";
import type { DocSize, SyncClient, SystemDefinition } from "./adapters/types.js";
import type { EditedMessage, SettledMessage, ToWorker, TypingWorkerInit } from "./typing-worker.js";
import { boundaryPosition, exponential, tokenFor, wallClock } from "./workload.js";
import {
  ServerSampler,
  connectClients,
  countTokens,
  hashText,
  startServer,
  waitUntil,
} from "./harness.js";
import { mulberry32, sleep, summarize, type LatencySummary } from "./stats.js";

export type EditMode = "spread" | "samePosition";

export interface TypingConfig {
  clients: number;
  mode: EditMode;
  durationMs: number;
  editsPerSecondPerClient: number;
  seed: number;
}

export interface TypingResult {
  scenario: "typing";
  system: string;
  clients: number;
  mode: EditMode;
  edits: number;
  latencyMs: LatencySummary;
  deliveredRatio: number;
  converged: boolean;
  allEditsPresent: boolean;
  settleMs: number;
  serverCpuPercent: number;
  serverPeakRssMb: number;
  bytesPerEdit: number;
  finalTextLength: number;
  clientEventLoopP99Ms: number;
}

const TYPING_WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "typing-worker.ts");
const CLIENTS_PER_WORKER = 12;
const MAX_WORKERS = 8;

function once<T>(worker: ChildProcess, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: { type: string }) => {
      if (message.type === type) {
        worker.off("message", onMessage);
        resolve(message as T);
      }
    };
    worker.on("message", onMessage);
    worker.once("error", reject);
  });
}

export async function runTyping(system: SystemDefinition, config: TypingConfig): Promise<TypingResult> {
  const server = await startServer(system);
  const workerCount = Math.min(MAX_WORKERS, Math.ceil(config.clients / CLIENTS_PER_WORKER));
  const workers: ChildProcess[] = [];
  try {
    const ids = Array.from({ length: config.clients }, (_, i) => `c${String(i).padStart(3, "0")}`);
    for (let w = 0; w < workerCount; w += 1) {
      const init: TypingWorkerInit = {
        system: system.name,
        url: server.url,
        clientIds: ids.filter((_, index) => index % workerCount === w),
        mode: config.mode,
        editsPerSecondPerClient: config.editsPerSecondPerClient,
        seed: config.seed + w * 7919,
      };
      workers.push(
        fork(TYPING_WORKER, [], {
          execArgv: ["--import", "tsx"],
          env: { ...process.env, TYPING_INIT: JSON.stringify(init) },
          serialization: "advanced",
          stdio: ["ignore", "inherit", "inherit", "ipc"],
        }),
      );
    }
    await Promise.all(workers.map((worker) => once(worker, "ready")));

    const sampler = new ServerSampler(server);
    await sampler.begin();
    const endAt = wallClock() + 300 + config.durationMs;
    const edited = workers.map((worker) => once<EditedMessage>(worker, "edited"));
    for (const worker of workers) worker.send({ type: "go", endAt } satisfies ToWorker);
    const editedResults = await Promise.all(edited);

    const edits = editedResults.reduce((sum, r) => sum + r.edits, 0);
    const sentAt = new Map<string, number>();
    for (const r of editedResults) r.sentTokens.forEach((token, i) => sentAt.set(token, r.sentTimes[i]!));

    const settled = workers.map((worker) => once<SettledMessage>(worker, "settled"));
    for (const worker of workers) {
      worker.send({ type: "settle", expectedTokens: edits } satisfies ToWorker);
    }
    const settledResults = await Promise.all(settled);
    const serverLoad = await sampler.end();

    const latencies: number[] = [];
    for (const r of settledResults) {
      r.receivedTokens.forEach((token, i) => {
        const sent = sentAt.get(token);
        if (sent !== undefined) latencies.push(Math.max(0, r.receivedTimes[i]! - sent));
      });
    }
    const expectedDeliveries = edits * (config.clients - 1);
    const hashes = new Set(settledResults.flatMap((r) => r.hashes));

    const result: TypingResult = {
      scenario: "typing",
      system: system.name,
      clients: config.clients,
      mode: config.mode,
      edits,
      latencyMs: summarize(latencies),
      deliveredRatio: expectedDeliveries === 0 ? 1 : latencies.length / expectedDeliveries,
      converged: hashes.size === 1,
      allEditsPresent: settledResults.every((r) => r.allEditsPresent),
      settleMs: Math.max(...settledResults.map((r) => r.settleMs)),
      serverCpuPercent: serverLoad.cpuPercent,
      serverPeakRssMb: serverLoad.peakRssMb,
      bytesPerEdit: edits === 0 ? 0 : settledResults.reduce((sum, r) => sum + r.bytes, 0) / edits,
      finalTextLength: settledResults[0]!.textLength,
      clientEventLoopP99Ms: Math.max(...settledResults.map((r) => r.loopP99Ms)),
    };

    for (const worker of workers) worker.send({ type: "stop" } satisfies ToWorker);
    return result;
  } finally {
    for (const worker of workers) worker.kill();
    await server.stop();
  }
}

export interface OfflineConfig {
  clients: number;
  offlineEdits: number;
  onlineEdits: number;
  seed: number;
}

export interface OfflineResult {
  scenario: "offline";
  system: string;
  clients: number;
  offlineEdits: number;
  onlineEdits: number;
  mergeMs: number;
  converged: boolean;
  allEditsPresent: boolean;
  bytesDuringMerge: number;
}

export async function runOffline(system: SystemDefinition, config: OfflineConfig): Promise<OfflineResult> {
  const server = await startServer(system);
  try {
    const set = await connectClients(system, server, config.clients);
    const { clients } = set;
    const random = mulberry32(config.seed);
    const [offline, ...online] = clients as [SyncClient, ...SyncClient[]];

    await offline.goOffline();

    for (let seq = 0; seq < config.offlineEdits; seq += 1) {
      offline.insert(boundaryPosition(offline.text(), random), tokenFor(offline.id, seq));
    }
    for (let seq = 0; seq < config.onlineEdits; seq += 1) {
      const author = online[seq % online.length]!;
      author.insert(boundaryPosition(author.text(), random), tokenFor(author.id, Math.floor(seq / online.length)));
    }

    await waitUntil(
      () => online.every((client) => countTokens(client.text()) === config.onlineEdits),
      30_000,
    );
    set.resetTraffic();

    const total = config.offlineEdits + config.onlineEdits;
    const startedAt = performance.now();
    await offline.goOnline();
    await waitUntil(() => clients.every((client) => countTokens(client.text()) === total), 60_000, 5);
    const mergeMs = performance.now() - startedAt;

    const hashes = new Set(clients.map((client) => hashText(client.text())));
    const result: OfflineResult = {
      scenario: "offline",
      system: system.name,
      clients: config.clients,
      offlineEdits: config.offlineEdits,
      onlineEdits: config.onlineEdits,
      mergeMs,
      converged: hashes.size === 1,
      allEditsPresent: clients.every((client) => countTokens(client.text()) === total),
      bytesDuringMerge: set.totalTraffic(),
    };
    await set.closeAll();
    return result;
  } finally {
    await server.stop();
  }
}

export interface BoardConfig {
  clients: number;
  shapes: number;
  mode: "ownShape" | "sameShape";
  durationMs: number;
  movesPerSecondPerClient: number;
  seed: number;
}

export interface BoardResult {
  scenario: "board";
  system: string;
  clients: number;
  mode: "ownShape" | "sameShape";
  moves: number;
  latencyMs: LatencySummary;
  converged: boolean;
  settleMs: number;
}

export async function runBoard(system: SystemDefinition, config: BoardConfig): Promise<BoardResult> {
  const server = await startServer(system);
  try {
    const set = await connectClients(system, server, config.clients);
    const { clients } = set;
    const random = mulberry32(config.seed);
    const shapeIds = Array.from({ length: config.shapes }, (_, index) => `shape-${index}`);

    for (const id of shapeIds) clients[0]!.moveShape(id, { x: 0, y: 0 });
    await waitUntil(
      () => clients.every((client) => Object.keys(client.shapes()).length === config.shapes),
      20_000,
    );

    const sentAt = new Map<string, number>();
    const latencies: number[] = [];
    for (const client of clients) {
      client.onRemoteShape((shapeId) => {
        const now = performance.now();
        const x = client.shapes()[shapeId]?.x;
        const sent = sentAt.get(`${shapeId}:${x}`);
        if (sent !== undefined) latencies.push(now - sent);
      });
    }

    let counter = 1;
    let moves = 0;
    const meanGap = 1000 / config.movesPerSecondPerClient;
    const endAt = performance.now() + config.durationMs;

    await Promise.all(
      clients.map(async (client, index) => {
        while (true) {
          await sleep(exponential(random, meanGap));
          if (performance.now() >= endAt) break;
          const shapeId = config.mode === "sameShape" ? shapeIds[0]! : shapeIds[index % shapeIds.length]!;
          const x = counter++;
          sentAt.set(`${shapeId}:${x}`, performance.now());
          client.moveShape(shapeId, { x, y: Math.floor(random() * 1000) });
          moves += 1;
        }
      }),
    );

    const settleStart = performance.now();
    const snapshotOf = (client: SyncClient) => JSON.stringify(Object.entries(client.shapes()).sort());
    await waitUntil(() => new Set(clients.map(snapshotOf)).size === 1, 15_000);
    const result: BoardResult = {
      scenario: "board",
      system: system.name,
      clients: config.clients,
      mode: config.mode,
      moves,
      latencyMs: summarize(latencies),
      converged: new Set(clients.map(snapshotOf)).size === 1,
      settleMs: performance.now() - settleStart,
    };
    await set.closeAll();
    return result;
  } finally {
    await server.stop();
  }
}

export interface GrowthConfig {
  clients: number;
  totalEdits: number;
  deleteRatio: number;
  seed: number;
}

export interface GrowthResult {
  scenario: "growth";
  system: string;
  clients: number;
  deleteRatio: number;
  edits: number;
  textBytes: number;
  docSize: DocSize;
  converged: boolean;
  elapsedMs: number;
}

export async function runGrowth(system: SystemDefinition, config: GrowthConfig): Promise<GrowthResult> {
  const server = await startServer(system);
  try {
    const set = await connectClients(system, server, config.clients);
    const { clients } = set;
    const random = mulberry32(config.seed);
    const startedAt = performance.now();
    const perClient = Math.ceil(config.totalEdits / config.clients);

    await Promise.all(
      clients.map(async (client) => {
        for (let step = 0; step < perClient; step += 1) {
          const length = client.text().length;
          if (length > 20 && random() < config.deleteRatio) {
            client.deleteRange(Math.floor(random() * length), 1 + Math.floor(random() * 5));
          } else {
            client.insert(Math.floor(random() * (length + 1)), String.fromCharCode(97 + Math.floor(random() * 26)));
          }
          if (step % 20 === 0) await sleep(0);
        }
      }),
    );

    await sleep(300);
    await waitUntil(() => new Set(clients.map((client) => hashText(client.text()))).size === 1, 60_000, 50);
    const elapsedMs = performance.now() - startedAt;
    const converged = new Set(clients.map((client) => hashText(client.text()))).size === 1;
    const docSize = await system.docSize((type) => server.ask(type as "docsize"));

    const result: GrowthResult = {
      scenario: "growth",
      system: system.name,
      clients: config.clients,
      deleteRatio: config.deleteRatio,
      edits: perClient * config.clients,
      textBytes: Buffer.byteLength(clients[0]!.text()),
      docSize,
      converged,
      elapsedMs,
    };
    await set.closeAll();
    return result;
  } finally {
    await server.stop();
  }
}
