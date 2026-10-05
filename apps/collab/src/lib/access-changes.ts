import type { Hocuspocus } from "@hocuspocus/server";
import { Redis } from "ioredis";
import { ACCESS_CHANGES_CHANNEL, accessChangeSchema, type AccessChange } from "@collab/shared";
import type { FileAccess } from "./access.js";

// The provider reconnects after a reset (and gets the new role) but gives up after "forbidden".
const RECONNECT = { code: 4205, reason: "Reset Connection" };
const FORBIDDEN = { code: 4403, reason: "Forbidden" };

/** Closes the open document connections a change of access applies to; returns how many. */
export function applyAccessChange(hocuspocus: Hocuspocus, change: AccessChange) {
  let closed = 0;
  for (const document of hocuspocus.documents.values()) {
    for (const connection of document.getConnections()) {
      const context = connection.context as Partial<FileAccess>;
      if (context.projectId !== change.projectId) continue;
      if (change.userId && context.userId !== change.userId) continue;
      connection.close(change.reason === "role" ? RECONNECT : FORBIDDEN);
      closed += 1;
    }
  }
  return closed;
}

export async function startAccessChangeListener(
  redisUrl: string,
  hocuspocus: Hocuspocus,
  onError?: (error: unknown) => void,
) {
  const subscriber = new Redis(redisUrl);
  subscriber.on("error", (error) => onError?.(error));

  subscriber.on("message", (_channel, raw) => {
    try {
      const parsed = accessChangeSchema.safeParse(JSON.parse(raw));
      if (parsed.success) applyAccessChange(hocuspocus, parsed.data);
    } catch (error) {
      onError?.(error);
    }
  });

  await subscriber.subscribe(ACCESS_CHANGES_CHANNEL);

  return async () => {
    await subscriber.quit().catch(() => undefined);
  };
}
