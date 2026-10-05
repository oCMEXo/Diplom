import { z } from "zod";

/**
 * Access is checked when a socket connects, so taking it away must also reach sockets that are
 * already open. The API closes its own (`/ws`) and publishes the change here for the sync server.
 */
export const ACCESS_CHANGES_CHANNEL = "access-changes";

/** `/ws` is closed with this code when access is taken away; the reason is the `reason` below. */
export const CLOSE_ACCESS_REVOKED = 4410;

export const accessChangeReasonSchema = z.enum(["removed", "left", "deleted", "role"]);
export type AccessChangeReason = z.infer<typeof accessChangeReasonSchema>;

export const accessChangeSchema = z.object({
  projectId: z.string().uuid(),
  /** Absent when the whole project is deleted: everybody loses it. */
  userId: z.string().uuid().optional(),
  /** "role" keeps the member in the project: their documents reconnect with the new role. */
  reason: accessChangeReasonSchema,
});
export type AccessChange = z.infer<typeof accessChangeSchema>;
