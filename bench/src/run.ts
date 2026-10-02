import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCharts, buildReport, type BenchRun } from "./report.js";
import { runBoard, runGrowth, runOffline, runTyping } from "./scenarios.js";
import { SYSTEMS } from "./systems.js";

const quick = process.argv.includes("--quick");
// --only=growth re-runs just the document-size scenario and keeps the other results of the last full run.
const onlyGrowth = process.argv.includes("--only=growth");
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../results");

const config = quick
  ? {
      reps: 1,
      typingClients: [2, 10],
      typingDurationMs: 3000,
      editsPerSecondPerClient: 1,
      offlineEdits: [50],
      boardClients: [2, 5],
      boardDurationMs: 3000,
      growthEdits: [1000],
      growthDeleteRatios: [0.05],
    }
  : {
      reps: 3,
      typingClients: [2, 5, 10, 25, 50, 100],
      typingDurationMs: 10_000,
      editsPerSecondPerClient: Number(process.env.EDITS_PER_SECOND ?? 1),
      offlineEdits: [50, 200, 1000],
      boardClients: [2, 10, 50],
      boardDurationMs: 8000,
      growthEdits: [1000, 5000, 20000],
      growthDeleteRatios: [0.05, 0.3],
    };

function log(message: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

const run: BenchRun = {
  meta: {
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model.trim() ?? "unknown",
    cpuCount: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    config,
  },
  typing: [],
  offline: [],
  board: [],
  growth: [],
};

if (onlyGrowth) {
  Object.assign(run, JSON.parse(readFileSync(path.join(outDir, "latest.json"), "utf8")) as BenchRun);
  run.growth = [];
}

function save() {
  mkdirSync(path.join(outDir, "charts"), { recursive: true });
  writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(run, null, 2));
  writeFileSync(path.join(outDir, "REPORT.md"), buildReport(run));
  for (const [name, svg] of Object.entries(buildCharts(run))) {
    writeFileSync(path.join(outDir, "charts", name), svg);
  }
}

for (const rep of onlyGrowth ? [] : Array.from({ length: config.reps }, (_, index) => index)) {
  for (const clients of config.typingClients) {
    for (const mode of ["spread", "samePosition"] as const) {
      for (const system of SYSTEMS) {
        log(`typing  ${system.name.padEnd(7)} N=${clients} ${mode} rep ${rep + 1}`);
        const result = await runTyping(system, {
          clients,
          mode,
          durationMs: config.typingDurationMs,
          editsPerSecondPerClient: config.editsPerSecondPerClient,
          seed: 1000 + rep,
        });
        run.typing.push(result);
        log(
          `        p50=${result.latencyMs.p50.toFixed(1)} p95=${result.latencyMs.p95.toFixed(1)} cpu=${result.serverCpuPercent.toFixed(0)}% ` +
            `ok=${result.converged && result.allEditsPresent} loopP99=${result.clientEventLoopP99Ms.toFixed(1)}ms`,
        );
      }
    }
  }
  save();

  for (const offlineEdits of config.offlineEdits) {
    for (const system of SYSTEMS) {
      log(`offline ${system.name.padEnd(7)} K=${offlineEdits} rep ${rep + 1}`);
      const result = await runOffline(system, {
        clients: 5,
        offlineEdits,
        onlineEdits: offlineEdits,
        seed: 2000 + rep,
      });
      run.offline.push(result);
      log(`        merge=${result.mergeMs.toFixed(0)}ms ok=${result.converged && result.allEditsPresent}`);
    }
  }
  save();

  for (const clients of config.boardClients) {
    for (const mode of ["ownShape", "sameShape"] as const) {
      for (const system of SYSTEMS) {
        log(`board   ${system.name.padEnd(7)} N=${clients} ${mode} rep ${rep + 1}`);
        const result = await runBoard(system, {
          clients,
          shapes: 20,
          mode,
          durationMs: config.boardDurationMs,
          movesPerSecondPerClient: 5,
          seed: 3000 + rep,
        });
        run.board.push(result);
        log(`        p95=${result.latencyMs.p95.toFixed(1)} ok=${result.converged}`);
      }
    }
  }
  save();
}

for (const deleteRatio of config.growthDeleteRatios) {
  for (const totalEdits of config.growthEdits) {
    for (const system of SYSTEMS) {
      log(`growth  ${system.name.padEnd(7)} edits=${totalEdits} deletes=${deleteRatio}`);
      const result = await runGrowth(system, { clients: 5, totalEdits, deleteRatio, seed: 4000 });
      run.growth.push(result);
      log(
        `        snapshot=${result.docSize.snapshotBytes}B history=${result.docSize.historyBytes}B text=${result.textBytes}B ok=${result.converged}`,
      );
    }
  }
}
save();
log(`done -> ${outDir}`);
process.exit(0);
