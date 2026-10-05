import type { FastifyBaseLogger } from "fastify";
import { purgeExpiredTrash } from "../modules/files/files.service.js";

const HOUR_MS = 60 * 60 * 1000;

/** Empties expired trash right away and then every hour; returns a function that stops it. */
export function startTrashCleanup(log: FastifyBaseLogger, intervalMs = HOUR_MS) {
  let running = false;

  const run = async () => {
    // A slow pass must not overlap the next one.
    if (running) return;
    running = true;
    try {
      const purged = await purgeExpiredTrash();
      if (purged > 0) log.info({ purged }, "expired files removed from the trash");
    } catch (error) {
      log.error(error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return async () => {
    clearInterval(timer);
  };
}
