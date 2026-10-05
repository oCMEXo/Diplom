import { useEffect, useRef, useState } from "react";
import { realtimeEventSchema, type RealtimeEvent } from "@collab/shared";
import { api, API_URL } from "./api";
import { wsUrl } from "./endpoints";
import { tokenStore } from "./tokenStore";

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const MAX_BACKOFF_MS = 5000;

export type RealtimeStatus = "connecting" | "open" | "closed";

export function useProjectEvents(projectId: string, onEvent: (event: RealtimeEvent) => void) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    async function connect() {
      const auth = tokenStore.get();
      if (disposed || !auth) return;
      setStatus("connecting");

      const url = new URL(wsUrl(API_URL, window.location.origin, "/ws"));
      url.searchParams.set("projectId", projectId);
      url.searchParams.set("token", auth.tokens.accessToken);

      socket = new WebSocket(url);
      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      socket.onmessage = (message) => {
        try {
          const parsed = realtimeEventSchema.safeParse(JSON.parse(message.data));
          if (parsed.success) handlerRef.current(parsed.data);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = async (event) => {
        if (disposed) return;
        setStatus("closed");
        if (event.code === CLOSE_FORBIDDEN) return;
        if (event.code === CLOSE_UNAUTHORIZED) {
          await api.get("/auth/me").catch(() => undefined);
        }
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [projectId]);

  return status;
}
