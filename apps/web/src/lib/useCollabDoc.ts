import { useEffect, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { colorForUser } from "./colors";
import { tokenStore } from "./tokenStore";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL;

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
