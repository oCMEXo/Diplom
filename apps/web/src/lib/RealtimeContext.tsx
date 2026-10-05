import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AccessChangeReason, PresenceUser, RealtimeEvent, RunStatus } from "@collab/shared";
import { useProjectEvents, type RealtimeStatus } from "./realtime";

export interface RunState {
  runId: string;
  status: "running" | RunStatus;
  startedBy: { id: string; name: string };
  output: { stream: "stdout" | "stderr"; chunk: string }[];
  exitCode: number | null;
  durationMs: number | null;
  errorLine: number | null;
  truncated: boolean;
}

type RunsByFile = Record<string, RunState>;
type Handler = (event: RealtimeEvent) => void;

interface RealtimeValue {
  status: RealtimeStatus;
  subscribe: (handler: Handler) => () => void;
  runs: RunsByFile;
  online: PresenceUser[];
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

function runsReducer(state: RunsByFile, event: RealtimeEvent): RunsByFile {
  switch (event.type) {
    case "run.started":
      return {
        ...state,
        [event.fileId]: {
          runId: event.runId,
          status: "running",
          startedBy: event.startedBy,
          output: [],
          exitCode: null,
          durationMs: null,
          errorLine: null,
          truncated: false,
        },
      };
    case "run.output": {
      const current = state[event.fileId];
      if (!current || current.runId !== event.runId) return state;
      return {
        ...state,
        [event.fileId]: {
          ...current,
          output: [...current.output, { stream: event.stream, chunk: event.chunk }],
        },
      };
    }
    case "run.finished": {
      const current = state[event.fileId];
      if (!current || current.runId !== event.runId) return state;
      return {
        ...state,
        [event.fileId]: {
          ...current,
          status: event.status,
          exitCode: event.exitCode,
          durationMs: event.durationMs,
          errorLine: event.errorLine,
          truncated: event.truncated,
        },
      };
    }
    default:
      return state;
  }
}

export function RealtimeProvider({
  projectId,
  onRevoked,
  children,
}: {
  projectId: string;
  /** The server closed the connection because access to the project was taken away. */
  onRevoked?: (reason: AccessChangeReason) => void;
  children: ReactNode;
}) {
  const handlers = useRef(new Set<Handler>());
  const [runs, dispatchRun] = useReducer(runsReducer, {});
  const [online, setOnline] = useState<PresenceUser[]>([]);

  const onEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === "presence.updated") setOnline(event.users);
    dispatchRun(event);
    handlers.current.forEach((handler) => handler(event));
  }, []);

  const status = useProjectEvents(projectId, onEvent, onRevoked);

  const subscribe = useCallback((handler: Handler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const value = useMemo(
    () => ({ status, subscribe, runs, online }),
    [status, subscribe, runs, online],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

export function useRealtimeStatus() {
  return useRealtime().status;
}

export function useRealtimeEvents(handler: Handler) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}

export function useRun(fileId: string): RunState | undefined {
  return useRealtime().runs[fileId];
}

export function useOnlineUsers() {
  return useRealtime().online;
}
