import { Redis } from "ioredis";
import { RUN_EVENTS_CHANNEL, runEventSchema } from "@collab/shared";
import { hub } from "./hub.js";

export async function startRunEventRelay(redisUrl: string, onError?: (error: unknown) => void) {
  const subscriber = new Redis(redisUrl);
  subscriber.on("error", (error) => onError?.(error));

  subscriber.on("message", (_channel, raw) => {
    try {
      const parsed = runEventSchema.safeParse(JSON.parse(raw));
      if (parsed.success) hub.broadcast(parsed.data.projectId, parsed.data);
    } catch (error) {
      onError?.(error);
    }
  });

  await subscriber.subscribe(RUN_EVENTS_CHANNEL);

  return async () => {
    await subscriber.quit().catch(() => undefined);
  };
}
