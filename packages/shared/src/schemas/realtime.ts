import { z } from "zod";
import { messageSchema } from "./message.js";
import { runEventSchema } from "./run.js";

export const messageCreatedEventSchema = z.object({
  type: z.literal("message.created"),
  message: messageSchema,
});

export const realtimeEventSchema = z.union([messageCreatedEventSchema, runEventSchema]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
