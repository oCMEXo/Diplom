import { randomBytes } from "node:crypto";

export function generateInviteCode(): string {
  return randomBytes(9).toString("base64url");
}
