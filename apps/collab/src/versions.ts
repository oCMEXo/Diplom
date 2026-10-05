import { prisma } from "@collab/db";

/** A new version at most this often per file, so a typing session leaves a few versions, not hundreds. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
/** The oldest versions beyond this are deleted. */
export const MAX_VERSIONS_PER_FILE = 50;

// The latest version of each open file. Documents are stored every few seconds while people type,
// so the check must usually be answered from memory, without a query or even reading the text.
const latest = new Map<string, { at: number; content: string }>();
// A restore records its own version; the stores it causes must not add the restored text again.
const restoring = new Set<string>();

async function latestVersion(fileId: string) {
  const known = latest.get(fileId);
  if (known) return known;
  const row = await prisma.fileVersion.findFirst({
    where: { fileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true, content: true },
  });
  if (!row) return null;
  const last = { at: row.createdAt.getTime(), content: row.content };
  latest.set(fileId, last);
  return last;
}

/**
 * Called on every store: saves `content()` as a version unless one was taken less than
 * SNAPSHOT_INTERVAL_MS ago or the text is the same as in the latest version.
 */
export async function snapshotIfChanged(
  fileId: string,
  content: () => string,
  authorId: string | null,
  now = Date.now(),
): Promise<boolean> {
  if (restoring.has(fileId)) return false;

  const last = await latestVersion(fileId);
  if (last && now - last.at < SNAPSHOT_INTERVAL_MS) return false;

  const text = content();
  if (last && last.content === text) return false;

  await recordVersion(fileId, text, authorId, now);
  return true;
}

/** Keeps the text a restore replaced (whatever the interval), unless the latest version already holds it. */
export async function keepReplacedText(fileId: string, content: string, authorId: string | null) {
  const last = await latestVersion(fileId);
  if (last && last.content === content) return false;
  await recordVersion(fileId, content, authorId);
  return true;
}

export async function recordVersion(fileId: string, content: string, authorId: string | null, now = Date.now()) {
  await prisma.fileVersion.create({
    data: { fileId, content, size: Buffer.byteLength(content), authorId, createdAt: new Date(now) },
  });
  latest.set(fileId, { at: now, content });

  // Runs only when a version is added (at most once per interval), so two small queries are fine.
  const stale = await prisma.fileVersion.findMany({
    where: { fileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_VERSIONS_PER_FILE,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.fileVersion.deleteMany({ where: { id: { in: stale.map((version) => version.id) } } });
  }
}

/** Snapshots of `fileId` are skipped while `work` runs. */
export async function withoutSnapshots<T>(fileId: string, work: () => Promise<T>): Promise<T> {
  restoring.add(fileId);
  try {
    return await work();
  } finally {
    restoring.delete(fileId);
  }
}

/** The document left memory; the next store reads the latest version from the database again. */
export function forgetFile(fileId: string) {
  latest.delete(fileId);
}
