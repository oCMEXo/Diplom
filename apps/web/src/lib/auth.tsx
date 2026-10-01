import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { AuthResponse, LoginInput, RegisterInput } from "@collab/shared";
import { api } from "./api";
import { tokenStore, type StoredUser } from "./tokenStore";

interface AuthContextValue {
  user: StoredUser | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  continueAsGuest: (name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useSyncExternalStore(tokenStore.subscribe, tokenStore.get);

  async function login(input: LoginInput) {
    const result = await api.post<AuthResponse>("/auth/login", input);
    tokenStore.set(result);
  }

  async function register(input: RegisterInput) {
    const result = await api.post<AuthResponse>("/auth/register", input);
    tokenStore.set(result);
  }

  async function continueAsGuest(name?: string) {
    const result = await api.post<AuthResponse>("/auth/guest", { name });
    tokenStore.set(result);
  }

  function logout() {
    const current = tokenStore.get();
    if (current) {
      api.post("/auth/logout", { refreshToken: current.tokens.refreshToken }).catch(() => {});
    }
    tokenStore.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        user: auth?.user ?? null,
        isAuthenticated: !!auth,
        login,
        register,
        continueAsGuest,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
