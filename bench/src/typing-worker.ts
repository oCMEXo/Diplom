import { monitorEventLoopDelay } from "node:perf_hooks";
import type { TrafficCounters } from "./adapters/types.js";
import { TOKEN_PATTERN, countTokens, hashText, waitUntil } from "./harness.js";
import { mulberry32, sleep } from "./stats.js";
import { SYSTEMS } from "./systems.js";
import { boundaryPosition, exponential, tokenFor, wallClock } from "./workload.js";

export interface TypingWorkerInit {
  system: string;
  url: string;
  clientIds: string[];
  mode: "spread" | "samePosition";
  editsPerSecondPerClient: number;
  seed: number;
}

export type ToWorker =
  | { type: "go"; endAt: number }
  | { type: "settle"; expectedTokens: number }
  | { type: "stop" };

export interface EditedMessage {
  type: "edited";
  edits: number;
  sentTokens: string[];
  sentTimes: number[];
}

export interface SettledMessage {
  type: "settled";
  settleMs: number;
  hashes: string[];
  allEditsPresent: boolean;
  textLength: number;
  bytes: number;
  loopP99Ms: number;
  receivedTokens: string[];
  receivedTimes: number[];
}

const init = JSON.parse(process.env.TYPING_INIT!) as TypingWorkerInit;
const port = {
  postMessage: (message: unknown) => process.send!(message),
  on: (_event: "message", handler: (message: ToWorker) => void) => process.on("message", handler),
};
const system = SYSTEMS.find((candidate) => candidate.name === init.system)!;

const traffic: TrafficCounters[] = init.clientIds.map(() => ({ bytesIn: 0, bytesOut: 0 }));
const clients = init.clientIds.map((id, index) => system.connect(init.url, id, traffic[index]!));
await Promise.all(clients.map((client) => client.ready()));

const receivedTokens: string[] = [];
const receivedTimes: number[] = [];
for (const client of clients) {
  client.onRemoteInsert((inserted) => {
    const now = wallClock();
    for (const token of inserted.match(TOKEN_PATTERN) ?? []) {
      receivedTokens.push(token);
      receivedTimes.push(now);
    }
  });
}

const waiting = new Map<string, (message: ToWorker) => void>();
port.on("message", (message: ToWorker) => waiting.get(message.type)?.(message));
const next = <T extends ToWorker["type"]>(type: T) =>
  new Promise<Extract<ToWorker, { type: T }>>((resolve) =>
    waiting.set(type, resolve as (message: ToWorker) => void),
  );

port.postMessage({ type: "ready" });

const go = await next("go");
for (const counters of traffic) {
  counters.bytesIn = 0;
  counters.bytesOut = 0;
}
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const random = mulberry32(init.seed);
const meanGap = 1000 / init.editsPerSecondPerClient;
const sentTokens: string[] = [];
const sentTimes: number[] = [];
let edits = 0;

await Promise.all(
  clients.map(async (client) => {
    let seq = 0;
    while (true) {
      await sleep(exponential(random, meanGap));
      if (wallClock() >= go.endAt) break;
      const token = tokenFor(client.id, seq);
      seq += 1;
      const position =
        init.mode === "samePosition" ? 0 : boundaryPosition(client.text(), random);
      sentTokens.push(token);
      sentTimes.push(wallClock());
      edits += 1;
      client.insert(position, token);
    }
  }),
);

port.postMessage({ type: "edited", edits, sentTokens, sentTimes } satisfies EditedMessage);

const settle = await next("settle");
const settleStart = performance.now();
await waitUntil(
  () => clients.every((client) => countTokens(client.text()) === settle.expectedTokens),
  20_000,
);
loop.disable();

port.postMessage({
  type: "settled",
  settleMs: performance.now() - settleStart,
  hashes: clients.map((client) => hashText(client.text())),
  allEditsPresent: clients.every((client) => countTokens(client.text()) === settle.expectedTokens),
  textLength: clients[0]!.text().length,
  bytes: traffic.reduce((sum, counters) => sum + counters.bytesIn + counters.bytesOut, 0),
  loopP99Ms: loop.percentile(99) / 1e6,
  receivedTokens,
  receivedTimes,
} satisfies SettledMessage);

await next("stop");
await Promise.all(clients.map((client) => client.close()));
process.exit(0);
