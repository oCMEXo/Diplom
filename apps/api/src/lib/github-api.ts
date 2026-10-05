import { AppError } from "./errors.js";

const API_BASE = "https://api.github.com";

/**
 * A minimal GitHub REST client for one request flow. The token lives only in this object: it is
 * sent to api.github.com and never stored or logged. GitHub's status codes are mapped to ours, with
 * 401 deliberately turned into 400 so the web client does not mistake it for an expired session.
 */
export class GithubApi {
  /** An empty token makes anonymous requests: enough to read public repositories. */
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /** Like `get`, but a 404 answers `null` instead of failing (used to probe for a branch). */
  async getOrNull<T>(path: string): Promise<T | null> {
    try {
      return await this.request<T>("GET", path);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) return null;
      throw error;
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "collab-code-platform",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AppError("Не удалось связаться с GitHub. Попробуйте ещё раз.", 502);
    }

    if (response.ok) return (await response.json()) as T;

    const detail = await response
      .json()
      .then((data) => (data as { message?: string }).message)
      .catch(() => undefined);

    switch (response.status) {
      case 401:
        throw new AppError("GitHub не принял токен: он недействителен или просрочен.", 400);
      case 403:
        throw new AppError(
          detail?.toLowerCase().includes("rate limit")
            ? "GitHub временно ограничил запросы. Попробуйте позже."
            : "У токена нет прав на запись в этот репозиторий (нужен доступ Contents: write).",
          403,
        );
      case 404:
        throw new AppError("Репозиторий или ветка не найдены, либо у токена нет к ним доступа.", 404);
      case 409:
      case 422:
        throw new AppError(`GitHub отклонил изменение${detail ? `: ${detail}` : "."}`, 409);
      default:
        throw new AppError("GitHub вернул ошибку. Попробуйте ещё раз.", 502);
    }
  }
}
