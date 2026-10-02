import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { MESSAGE_PAGE_SIZE, type Message } from "@collab/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRealtimeEvents, useRealtimeStatus } from "../lib/RealtimeContext";
import { Avatar } from "./ui/Avatar";
import { IconButton } from "./ui/Button";

function mergeById(existing: Message[], incoming: Message[]) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const loadedOnce = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  const loadLatest = useCallback(async () => {
    const latest = await api.get<Message[]>(
      `/projects/${projectId}/messages?limit=${MESSAGE_PAGE_SIZE}`,
    );
    setMessages((prev) => mergeById(prev, latest));
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      setHasMore(latest.length === MESSAGE_PAGE_SIZE);
    }
  }, [projectId]);

  const status = useRealtimeStatus();
  useRealtimeEvents((event) => {
    if (event.type === "message.created" && event.message.projectId === projectId) {
      setMessages((prev) => mergeById(prev, [event.message]));
    }
  });

  useEffect(() => {
    setMessages([]);
    loadedOnce.current = false;
    loadLatest().catch(() => undefined);
  }, [loadLatest]);

  useEffect(() => {
    if (status === "open" && loadedOnce.current) loadLatest().catch(() => undefined);
  }, [status, loadLatest]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  function onScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    const older = await api.get<Message[]>(
      `/projects/${projectId}/messages?limit=${MESSAGE_PAGE_SIZE}&before=${first.id}`,
    );
    stickToBottom.current = false;
    setMessages((prev) => mergeById(prev, older));
    setHasMore(older.length === MESSAGE_PAGE_SIZE);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - previousHeight;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSendError(null);
    setDraft("");
    stickToBottom.current = true;
    try {
      const message = await api.post<Message>(`/projects/${projectId}/messages`, { body });
      setMessages((prev) => mergeById(prev, [message]));
    } catch {
      setDraft(body);
      setSendError("Не удалось отправить");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {hasMore && (
          <button
            onClick={() => loadOlder().catch(() => undefined)}
            className="mb-3 w-full rounded-lg border border-line py-1.5 text-xs text-muted transition hover:bg-raised hover:text-fg"
          >
            Показать ранее
          </button>
        )}
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-medium">Здесь пока тихо</p>
            <p className="text-xs text-muted">Напишите первое сообщение — его увидят все участники проекта.</p>
          </div>
        )}
        {messages.map((m, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped =
            !newDay &&
            previous.author.id === m.author.id &&
            new Date(m.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_GAP_MS;
          const mine = m.author.id === user?.id;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium text-faint">
                  <span className="h-px flex-1 bg-line" />
                  {formatDay(m.createdAt)}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className={`group flex gap-2.5 ${grouped ? "mt-0.5" : "mt-3"}`}>
                <div className="w-7 shrink-0 pt-0.5">
                  {!grouped && <Avatar id={m.author.id} name={m.author.name} size="sm" />}
                </div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="flex items-baseline gap-2 text-xs">
                      <span className="font-semibold text-fg">{mine ? "Вы" : m.author.name}</span>
                      {m.author.isGuest && !mine && <span className="text-faint">гость</span>}
                      <span className="text-faint">{formatTime(m.createdAt)}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg/90">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="border-t border-line p-3">
        {sendError && <p className="mb-2 text-xs text-bad">{sendError}</p>}
        {status !== "open" && (
          <p className="mb-2 text-xs text-warn">{status === "connecting" ? "Подключаемся к чату…" : "Нет связи — сообщения могут приходить с задержкой"}</p>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-line bg-canvas px-3 py-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <textarea
            ref={composer}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={2000}
            rows={1}
            placeholder="Сообщение..."
            aria-label="Сообщение"
            className="max-h-32 min-h-[1.5rem] min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 placeholder:text-faint focus:outline-none"
          />
          <IconButton label="Отправить" type="submit" disabled={!draft.trim()} className="-mr-1 h-7 w-7 text-accent">
            <SendHorizontal size={17} />
          </IconButton>
        </div>
      </form>
    </div>
  );
}
