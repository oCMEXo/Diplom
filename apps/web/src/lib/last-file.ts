const key = (projectId: string) => `collab.last-file.${projectId}`;

export function rememberFile(projectId: string, fileId: string) {
  try {
    window.localStorage.setItem(key(projectId), fileId);
  } catch {
    // storage may be blocked; the project then simply opens on its first file
  }
}

export function lastFile(projectId: string): string | null {
  try {
    return window.localStorage.getItem(key(projectId));
  } catch {
    return null;
  }
}

/** The file a project should open on: the one the person had open, else the README, else the first. */
export function pickStartFile<T extends { id: string; path: string }>(projectId: string, files: T[]): T | null {
  if (files.length === 0) return null;
  const remembered = lastFile(projectId);
  return (
    files.find((file) => file.id === remembered) ??
    files.find((file) => /^readme(\.\w+)?$/i.test(file.path)) ??
    [...files].sort((a, b) => a.path.localeCompare(b.path))[0] ??
    null
  );
}
