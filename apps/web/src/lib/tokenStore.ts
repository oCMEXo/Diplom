export interface StoredUser {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = "collab.auth";

interface StoredAuth {
  tokens: AuthTokens;
  user: StoredUser;
}

let current: StoredAuth | null = loadFromStorage();
const listeners = new Set<() => void>();

function loadFromStorage(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function persist() {
  if (current) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((listener) => listener());
}

export const tokenStore = {
  get(): StoredAuth | null {
    return current;
  },
  set(auth: StoredAuth) {
    current = auth;
    persist();
  },
  setTokens(tokens: AuthTokens) {
    if (!current) return;
    current = { ...current, tokens };
    persist();
  },
  clear() {
    current = null;
    persist();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
