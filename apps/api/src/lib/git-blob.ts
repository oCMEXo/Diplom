import { createHash } from "node:crypto";

/** The SHA-1 git assigns to a file: sha1("blob <byte length>\0" + content). */
export function gitBlobSha(content: Uint8Array | string): string {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}
