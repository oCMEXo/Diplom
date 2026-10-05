import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { RotateCcw, SquareTerminal, X } from "lucide-react";
import {
  TERMINAL_MAX_MINUTES,
  TERMINAL_WORKDIR,
  terminalServerMessageSchema,
  type TerminalClientMessage,
  type TerminalTicket,
} from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { wsUrl } from "../lib/endpoints";
import { useRunMode } from "../lib/features";
import { currentRunCode, runCode } from "../lib/run-code";
import { Button } from "./ui/Button";
import { RunCodeForm } from "./RunAccess";
import { Spinner } from "./ui/Spinner";

const TERMINAL_URL = import.meta.env.VITE_TERMINAL_URL ?? "http://localhost:3003";
const HEIGHT_KEY = "collab.terminalHeight";

type Phase =
  | { name: "locked" }
  | { name: "connecting"; message: string }
  | { name: "ready" }
  | { name: "ended"; message: string };

function savedHeight() {
  try {
    return Number(localStorage.getItem(HEIGHT_KEY)) || 300;
  } catch {
    return 300;
  }
}

// Git Bash-like colours on a dark background, whatever the app's theme.
const THEME = {
  background: "#0b0d12",
  foreground: "#e6e9f1",
  cursor: "#e6e9f1",
  selectionBackground: "#7c6cff55",
  black: "#1c2030",
  green: "#34d399",
  yellow: "#fbbf24",
  magenta: "#c084fc",
  blue: "#60a5fa",
  cyan: "#22d3ee",
  red: "#f87171",
  white: "#e6e9f1",
};

function HeaderButton({ label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8e96aa] transition hover:bg-white/10 hover:text-[#e6e9f1]"
      {...rest}
    />
  );
}

/**
 * A live command line in a sandbox with the project's files, like Git Bash: `ls`, `node main.js`,
 * `python app.py`. One session per open panel; closing the panel ends it.
 */
export function TerminalPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const mode = useRunMode();
  const host = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "connecting", message: "Готовим терминал…" });
  const [height, setHeight] = useState(savedHeight);

  const locked = mode === "code" && !currentRunCode();

  useEffect(() => {
    if (!host.current || !mode || mode === "off") return;
    if (locked) {
      setPhase({ name: "locked" });
      return;
    }

    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    let socket: WebSocket | null = null;
    let disposed = false;
    const send = (message: TerminalClientMessage) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    setPhase({ name: "connecting", message: "Готовим терминал…" });
    (async () => {
      let ticket: string;
      try {
        ({ ticket } = await api.post<TerminalTicket>(`/projects/${projectId}/terminal`));
      } catch (error) {
        if (disposed) return;
        if (mode === "code" && error instanceof ApiError && error.status === 403 && /код/i.test(error.message)) {
          runCode.clear();
          setPhase({ name: "locked" });
          return;
        }
        setPhase({ name: "ended", message: error instanceof ApiError ? error.message : "Не удалось открыть терминал" });
        return;
      }
      if (disposed) return;
      const url = new URL(wsUrl(TERMINAL_URL, window.location.origin));
      url.search = new URLSearchParams({ ticket, cols: String(term.cols), rows: String(term.rows) }).toString();
      socket = new WebSocket(url);
      let ended = false;
      socket.onmessage = (event) => {
        const parsed = terminalServerMessageSchema.safeParse(JSON.parse(String(event.data)));
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "output") term.write(message.data);
        else if (message.type === "status") setPhase({ name: "connecting", message: message.message });
        else if (message.type === "ready") {
          setPhase({ name: "ready" });
          term.focus();
        } else {
          ended = true;
          setPhase({ name: "ended", message: message.message });
        }
      };
      socket.onclose = () => {
        if (!disposed && !ended) setPhase({ name: "ended", message: "Связь с терминалом прервалась." });
      };
    })();

    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Hidden for a moment: nothing to measure.
      }
    });
    observer.observe(host.current);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket?.close();
      term.dispose();
    };
  }, [projectId, session, mode, locked]);

  function startResize(event: ReactPointerEvent) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    let latest = startHeight;
    const move = (moveEvent: PointerEvent) => {
      latest = Math.min(window.innerHeight - 160, Math.max(140, startHeight + startY - moveEvent.clientY));
      setHeight(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(HEIGHT_KEY, String(latest));
      } catch {
        // Not remembered: fine.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section aria-label="Терминал" className="relative flex shrink-0 flex-col border-t border-line bg-[#0b0d12]" style={{ height }}>
      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        title="Потяните, чтобы изменить высоту"
      />
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs text-[#8e96aa]">
        <SquareTerminal size={14} className="text-[#34d399]" />
        <span className="font-medium text-[#e6e9f1]">Терминал</span>
        <span className="hidden truncate sm:inline">
          песочница · {TERMINAL_WORKDIR} · без интернета · до {TERMINAL_MAX_MINUTES} минут · правки здесь не попадают в проект
        </span>
        <span className="flex-1" />
        <HeaderButton label="Новый сеанс с текущими файлами" onClick={() => setSession((value) => value + 1)}>
          <RotateCcw size={14} />
        </HeaderButton>
        <HeaderButton label="Закрыть терминал" onClick={onClose}>
          <X size={15} />
        </HeaderButton>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 px-2 py-1" />
        {phase.name !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0d12]/85 p-4">
            {phase.name === "connecting" && (
              <p className="flex items-center gap-3 text-sm text-[#8e96aa]">
                <Spinner /> {phase.message}
              </p>
            )}
            {phase.name === "ended" && (
              <div className="space-y-3 text-center">
                <p className="text-sm text-[#e6e9f1]">{phase.message}</p>
                <Button size="sm" variant="primary" onClick={() => setSession((value) => value + 1)}>
                  <RotateCcw size={13} />
                  Открыть заново
                </Button>
              </div>
            )}
            {phase.name === "locked" && (
              <div className="w-full max-w-sm rounded-xl bg-surface p-5 text-fg shadow-pop">
                <p className="mb-3 text-sm text-muted">Терминал на этом сайте открывается только по коду доступа владельца.</p>
                <RunCodeForm onUnlocked={() => setSession((value) => value + 1)} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
