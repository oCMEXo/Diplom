import { tokenStore } from "./tokenStore";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<void> | null = null;

async function refreshTokens(): Promise<void> {
  const auth = tokenStore.get();
  if (!auth) throw new ApiError("Not authenticated", 401);

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: auth.tokens.refreshToken }),
  });

  if (!response.ok) {
    tokenStore.clear();
    throw new ApiError("Session expired", 401);
  }

  const data = await response.json();
  tokenStore.setTokens(data.tokens);
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const auth = tokenStore.get();
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    headers.set("Authorization", `Bearer ${auth.tokens.accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (response.status === 401 && auth && retry) {
    refreshPromise ??= refreshTokens().finally(() => {
      refreshPromise = null;
    });
    await refreshPromise;
    return request<T>(path, options, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(body.message ?? "Request failed", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { API_URL };
