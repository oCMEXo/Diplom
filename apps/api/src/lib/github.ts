import { IMPORT_LIMITS } from "@collab/shared";
import { AppError } from "./errors.js";

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch or tag; `null` means the repository's default branch. */
  ref: string | null;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;

/**
 * Accepts the forms people actually paste: https://github.com/o/r, .../r.git, .../r/tree/branch,
 * github.com/o/r, git@github.com:o/r.git and the short `o/r`. Anything else is rejected, so only
 * well-formed owner/repo names ever reach the download URL.
 */
export function parseGithubUrl(input: string): RepoRef | null {
  let value = input.trim().replace(/[?#].*$/, "");
  const ssh = value.match(/^git@github\.com:(.+)$/i);
  if (ssh) value = `github.com/${ssh[1]}`;
  value = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

  const segments = value.split("/").filter(Boolean);
  if (/^github\.com$/i.test(segments[0] ?? "")) segments.shift();
  else if (segments.length !== 2) return null;

  const [owner, rawRepo, kind, branch] = segments;
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;

  let ref: string | null = null;
  if (kind === "tree" && branch) {
    if (!REF.test(branch) || branch.includes("..")) return null;
    ref = branch;
  }
  return { owner, repo, ref };
}

const ALLOWED_HOSTS = new Set(["codeload.github.com", "github.com"]);
const MAX_REDIRECTS = 3;

export function zipUrl({ owner, repo, ref }: RepoRef) {
  const tail = ref ? ref.split("/").map(encodeURIComponent).join("/") : "HEAD";
  return `https://codeload.github.com/${owner}/${repo}/zip/${tail}`;
}

function tooBig() {
  return new AppError(
    `Репозиторий слишком большой (архив больше ${Math.round(IMPORT_LIMITS.maxZipBytes / 1024 / 1024)} МБ).`,
    413,
  );
}

/** Downloads the repository archive from GitHub, following only redirects that stay on GitHub. */
export async function downloadRepoZip(
  repo: RepoRef,
  fetchImpl: typeof fetch = fetch,
  maxBytes: number = IMPORT_LIMITS.maxZipBytes,
): Promise<Uint8Array> {
  let url = zipUrl(repo);
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new AppError("Не удалось связаться с GitHub. Попробуйте ещё раз.", 502);
    }
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    const next = location ? new URL(location, url) : null;
    if (!next || next.protocol !== "https:" || !ALLOWED_HOSTS.has(next.hostname)) {
      throw new AppError("GitHub вернул неожиданный адрес для загрузки.", 502);
    }
    url = next.toString();
  }

  if (!response || (response.status >= 300 && response.status < 400)) {
    throw new AppError("Слишком много перенаправлений при загрузке с GitHub.", 502);
  }
  if (response.status === 404) {
    throw new AppError("Репозиторий или ветка не найдены. Приватные репозитории пока не поддерживаются.", 404);
  }
  if (!response.ok || !response.body) {
    throw new AppError("GitHub не отдал архив репозитория.", 502);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
