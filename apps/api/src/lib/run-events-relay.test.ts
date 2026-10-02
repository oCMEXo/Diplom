import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUN_EVENTS_CHANNEL, type RunEvent } from "@collab/shared";
import { env } from "../env.js";
import { hub } from "./hub.js";
import { startRunEventRelay } from "./run-events-relay.js";

function waitFor<T>(read: () => T | undefined, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = read();
      if (value !== undefined) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        reject(new Error("timed out"));
      }
    }, 20);
  });
}

describe("run event relay", () => {
  let stop: () => Promise<void>;
  let publisher: Redis;

  beforeAll(async () => {
    stop = await startRunEventRelay(env.REDIS_URL);
    publisher = new Redis(env.REDIS_URL);
  });

  afterAll(async () => {
    await stop();
    publisher.disconnect();
  });

  const event = (projectId: string): RunEvent => ({
    type: "run.output",
    runId: randomUUID(),
    projectId,
    fileId: randomUUID(),
    stream: "stdout",
    chunk: "hello\n",
  });

  it("forwards runner events from redis to that project's subscribers", async () => {
    const projectId = randomUUID();
    const otherProject = randomUUID();
    const mine: string[] = [];
    const theirs: string[] = [];
    const off1 = hub.subscribe(projectId, { send: (d) => mine.push(d) });
    const off2 = hub.subscribe(otherProject, { send: (d) => theirs.push(d) });

    await publisher.publish(RUN_EVENTS_CHANNEL, JSON.stringify(event(projectId)));
    const received = await waitFor(() => mine[0]);
    off1();
    off2();

    expect(JSON.parse(received)).toMatchObject({ type: "run.output", chunk: "hello\n" });
    expect(theirs).toHaveLength(0);
  });

  it("drops malformed payloads without crashing", async () => {
    const projectId = randomUUID();
    const received: string[] = [];
    const off = hub.subscribe(projectId, { send: (d) => received.push(d) });

    await publisher.publish(RUN_EVENTS_CHANNEL, "not json");
    await publisher.publish(RUN_EVENTS_CHANNEL, JSON.stringify({ type: "run.output", nope: true }));
    await publisher.publish(RUN_EVENTS_CHANNEL, JSON.stringify(event(projectId)));
    await waitFor(() => received[0]);
    off();

    expect(received).toHaveLength(1);
  });
});
