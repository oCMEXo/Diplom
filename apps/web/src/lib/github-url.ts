/** "https://github.com/Owner/Repo/tree/dev" -> "owner/repo" (lower-case, for comparing); null if it is not a repo link. */
export function repoSlug(url: string): string | null {
  const path = url.trim().replace(/[?#].*$/, "").replace(/^git@github\.com:/i, "github.com/").replace(/^https?:\/\//i, "");
  const segments = path.replace(/^www\./i, "").split("/").filter(Boolean);
  if (/^github\.com$/i.test(segments[0] ?? "")) segments.shift();
  else if (segments.length !== 2) return null;
  const [owner, repo] = segments;
  if (!owner || !repo) return null;
  return `${owner}/${repo.replace(/\.git$/i, "")}`.toLowerCase();
}
