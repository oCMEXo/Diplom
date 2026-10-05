import { z } from "zod";
import { messageSchema } from "./message.js";
import { runEventSchema } from "./run.js";

export const messageCreatedEventSchema = z.object({
  type: z.literal("message.created"),
  message: messageSchema,
});

export const presenceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isGuest: z.boolean(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const presenceEventSchema = z.object({
  type: z.literal("presence.updated"),
  projectId: z.string().uuid(),
  users: z.array(presenceUserSchema),
});

/** Somebody switched the project to another branch: everybody's file list changes. */
export const projectBranchEventSchema = z.object({
  type: z.literal("project.branch"),
  projectId: z.string().uuid(),
  branch: z.string(),
});

export const realtimeEventSchema = z.union([
  messageCreatedEventSchema,
  presenceEventSchema,
  projectBranchEventSchema,
  runEventSchema,
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
