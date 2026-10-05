import { Redis } from "ioredis";
import { ACCESS_CHANGES_CHANNEL, CLOSE_ACCESS_REVOKED, type AccessChange } from "@collab/shared";
import { env } from "../env.js";
import { hub } from "./hub.js";

let publisher: Redis | null = null;

/**
 * Makes a change of access reach sockets that are already open: this process closes its own `/ws`
 * connections, and the sync server (another process) learns about it through Redis.
 */
export async function announceAccessChange(change: AccessChange) {
  if (change.reason !== "role") {
    hub.disconnect(change.projectId, change.userId ?? null, CLOSE_ACCESS_REVOKED, change.reason);
  }
  if (change.reason !== "deleted") {
    hub.broadcast(change.projectId, { type: "project.members", projectId: change.projectId });
  }

  // One retry at most: the request that changed access should not hang while Redis is away.
  publisher ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await publisher.publish(ACCESS_CHANGES_CHANNEL, JSON.stringify(change));
  } catch {
    // The change is already in the database and every new connection checks it; without Redis only
    // the documents open right now keep the old access, until they reconnect.
  }
}

export async function closeAccessChanges() {
  publisher?.disconnect();
  publisher = null;
}
