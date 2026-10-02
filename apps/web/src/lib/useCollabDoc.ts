import { useEffect, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { tokenStore } from "./tokenStore";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL;

const USER_COLORS = ["#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6"];

export function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return USER_COLORS[hash % USER_COLORS.length]!;
}

export type CollabStatus = "connecting" | "connected" | "offline";

/** Connects one Yjs document (one file) to the sync server and keeps a local offline copy. */
export function useCollabDoc(fileId: string) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<CollabStatus>("connecting");

  useEffect(() => {
    const auth = tokenStore.get();
    if (!auth) return;

    const next = new HocuspocusProvider({
      url: COLLAB_URL,
      name: fileId,
      token: auth.tokens.accessToken,
      onStatus: ({ status: value }) => setStatus(value === "connected" ? "connected" : "offline"),
    });
    const persistence = new IndexeddbPersistence(fileId, next.document);
    next.setAwarenessField("user", { name: auth.user.name, color: colorForUser(auth.user.id) });
    setProvider(next);

    return () => {
      setProvider(null);
      next.destroy();
      void persistence.destroy();
    };
  }, [fileId]);

  return { provider, status };
}
