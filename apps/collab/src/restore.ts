import type { Extension, Hocuspocus } from "@hocuspocus/server";
import type { Text as YText } from "yjs";
import { prisma } from "@collab/db";
import { AccessError, resolveFileAccess } from "./lib/access.js";
import { keepReplacedText, withoutSnapshots } from "./versions.js";

const RESTORE_URL = /^\/files\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})\/restore$/i;

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Turns `text` into `next` by replacing only the part that differs, so collaborators whose
 * cursors are outside it stay where they were.
 */
export function replaceText(text: YText, next: string) {
  const current = text.toString();
  const max = Math.min(current.length, next.length);
  let start = 0;
  while (start < max && current[start] === next[start]) start++;
  // Never split an emoji (a surrogate pair) between the kept and the replaced part.
  if (start > 0 && isHighSurrogate(current.charCodeAt(start - 1))) start--;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end]) end++;
  if (end > 0 && isLowSurrogate(current.charCodeAt(current.length - end))) end--;

  const removed = current.length - start - end;
  if (removed > 0) text.delete(start, removed);
  if (next.length - start - end > 0) text.insert(start, next.slice(start, next.length - end));
}

/**
 * `text` with the line breaks `current` uses. Monaco keeps one kind per file and converts what it
 * receives, so a version with other line breaks would make the editors' text drift from the document.
 */
export function withLineBreaksOf(text: string, current: string) {
  if (!current.includes("\n")) return text;
  const lf = text.replace(/\r\n/g, "\n");
  return current.includes("\r\n") ? lf.replace(/\n/g, "\r\n") : lf;
}

/**
 * Puts a version back into the live document. The sync server is the only place that holds it,
 * so the restore is applied here as an ordinary edit: connected people receive it like any other
 * change, and the stored state is written from the same document they are editing.
 */
export async function restoreVersion(instance: Hocuspocus, fileId: string, versionId: string, userId: string) {
  const version = await prisma.fileVersion.findFirst({ where: { id: versionId, fileId }, select: { content: true } });
  if (!version) throw new AccessError("Version not found", 404);

  await withoutSnapshots(fileId, async () => {
    const connection = await instance.openDirectConnection(fileId, { userId });
    try {
      const document = connection.document!;
      let before = "";
      let after = "";
      // One transaction, so everybody gets a single update and the text kept below is exactly what was replaced.
      document.transact(() => {
        const text = document.getText("monaco");
        before = text.toString();
        after = withLineBreaksOf(version.content, before);
        replaceText(text, after);
      });
      // The replaced text becomes a version too, so a restore can be undone the same way.
      if (before !== after) await keepReplacedText(fileId, before, userId);
    } finally {
      // Stores the document right away and unloads it if nobody has it open.
      await connection.disconnect();
    }
  });
}

/** POST /files/:fileId/versions/:versionId/restore, called by the API with the user's access token. */
export const restoreExtension: Extension = {
  async onRequest({ request, response, instance }) {
    const path = new URL(request.url ?? "/", "http://collab").pathname;
    const match = request.method === "POST" ? RESTORE_URL.exec(path) : null;
    if (!match) return;
    const [, fileId, versionId] = match;

    try {
      // The role is checked again here, as for any edit: this address is reachable from outside.
      const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1] ?? "";
      const access = await resolveFileAccess(token, fileId);
      if (access.role === "viewer") throw new AccessError("Viewers cannot restore versions", 403);
      await restoreVersion(instance, fileId, versionId, access.userId);
      response.writeHead(204).end();
    } catch (err) {
      const status = err instanceof AccessError ? err.status : 500;
      if (status === 500) console.error("[versions] restore failed", err);
      response
        .writeHead(status, { "Content-Type": "application/json" })
        .end(JSON.stringify({ message: err instanceof AccessError ? err.message : "Restore failed" }));
    }
    // An empty rejection tells Hocuspocus the request is answered, so it does not reply "OK" on top.
    return Promise.reject();
  },
};
