import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { MESSAGE_PAGE_SIZE, type Message } from "@collab/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRealtimeEvents, useRealtimeStatus } from "../lib/RealtimeContext";

function mergeById(existing: Message[], incoming: Message[]) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const loadedOnce = useRef(false);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase text-slate-400">Чат</h2>
        <span className="text-xs text-slate-400">
          {status === "open" ? "● онлайн" : status === "connecting" ? "○ подключение" : "○ нет связи"}
        </span>
      </div>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {hasMore && (
          <button
            onClick={() => loadOlder().catch(() => undefined)}
            className="w-full rounded border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            Показать ранее
          </button>
        )}
        {messages.length === 0 && (
          <p className="pt-4 text-center text-xs text-slate-400">Сообщений пока нет</p>
        )}
        {messages.map((m) => {
          const mine = m.author.id === user?.id;
          return (
            <div key={m.id} className={mine ? "text-right" : ""}>
              <div className="text-xs text-slate-400">
                {mine ? "вы" : m.author.name}
                {m.author.isGuest && !mine && " (гость)"} · {formatTime(m.createdAt)}
              </div>
              <div
                className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left text-sm ${
                  mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="space-y-1 border-t border-slate-200 p-2">
        {sendError && <p className="text-xs text-red-600">{sendError}</p>}
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="Сообщение..."
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            →
          </button>
        </div>
      </form>
    </div>
  );
}
