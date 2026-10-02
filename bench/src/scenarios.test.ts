import { describe, expect, it } from "vitest";
import { runBoard, runGrowth, runOffline, runTyping } from "./scenarios.js";
import { SYSTEMS } from "./systems.js";

describe.each(SYSTEMS.map((system) => [system.label, system] as const))("%s", (_label, system) => {
  it("converges while several clients type in different places", async () => {
    const result = await runTyping(system, {
      clients: 4,
      mode: "spread",
      durationMs: 1500,
      editsPerSecondPerClient: 6,
      seed: 1,
    });
    expect(result.edits).toBeGreaterThan(10);
    expect(result.converged).toBe(true);
    expect(result.allEditsPresent).toBe(true);
    expect(result.deliveredRatio).toBeGreaterThan(0.99);
    expect(result.latencyMs.p50).toBeGreaterThan(0);
    expect(result.bytesPerEdit).toBeGreaterThan(0);
  });

  it("converges when everyone inserts at the same position", async () => {
    const result = await runTyping(system, {
      clients: 4,
      mode: "samePosition",
      durationMs: 1500,
      editsPerSecondPerClient: 6,
      seed: 2,
    });
    expect(result.converged).toBe(true);
    expect(result.allEditsPresent).toBe(true);
  });

  it("merges a client that edited offline", async () => {
    const result = await runOffline(system, { clients: 3, offlineEdits: 30, onlineEdits: 30, seed: 3 });
    expect(result.converged).toBe(true);
    expect(result.allEditsPresent).toBe(true);
    expect(result.mergeMs).toBeGreaterThan(0);
  });

  it("converges when clients move shapes on a board", async () => {
    const same = await runBoard(system, {
      clients: 3,
      shapes: 5,
      mode: "sameShape",
      durationMs: 1200,
      movesPerSecondPerClient: 8,
      seed: 4,
    });
    expect(same.converged).toBe(true);
    expect(same.moves).toBeGreaterThan(5);
  });

  it("reports document size after mixed inserts and deletes", async () => {
    const result = await runGrowth(system, { clients: 3, totalEdits: 300, deleteRatio: 0.3, seed: 5 });
    expect(result.converged).toBe(true);
    expect(result.docSize.snapshotBytes).toBeGreaterThan(0);
  });
});
