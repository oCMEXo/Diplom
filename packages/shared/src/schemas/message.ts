import { z } from "zod";

export const MESSAGE_PAGE_SIZE = 50;

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const messageAuthorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isGuest: z.boolean(),
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  author: messageAuthorSchema,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const listMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGE_PAGE_SIZE),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message.created"), message: messageSchema }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
