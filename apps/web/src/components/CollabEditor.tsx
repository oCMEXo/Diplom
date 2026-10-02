import { useEffect, useRef, useState, type ReactNode } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { MonacoBinding } from "y-monaco";
import { IndexeddbPersistence } from "y-indexeddb";
import { tokenStore } from "../lib/tokenStore";
import { installRemoteCursorStyles } from "../lib/cursor-styles";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL;

const CURSOR_COLORS = ["#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6"];

function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

export interface EditorController {
  getCode: () => string;
  /** Calls the handler with the full text now and after every change (local or remote). */
  subscribe: (handler: (text: string) => void) => () => void;
  setErrorLine: (line: number | null) => void;
}

function languageFor(language: string | null): string {
  return language ?? "plaintext";
}

export function CollabEditor({
  fileId,
  language,
  readOnly,
  headerExtra,
  onReady,
}: {
  fileId: string;
  language: string | null;
  readOnly: boolean;
  headerExtra?: ReactNode;
  onReady?: (controller: EditorController) => void;
}) {
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    const auth = tokenStore.get();
    if (!auth) return;

    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: fileId,
      token: auth.tokens.accessToken,
      onStatus: ({ status }) => setStatus(status === "connected" ? "connected" : "offline"),
    });
    providerRef.current = provider;

    new IndexeddbPersistence(fileId, provider.document);

    const user = tokenStore.get()?.user;
    if (user) {
      provider.setAwarenessField("user", { name: user.name, color: colorForUser(user.id) });
    }

    const stopCursorStyles = provider.awareness ? installRemoteCursorStyles(provider.awareness) : undefined;

    return () => {
      stopCursorStyles?.();
      bindingRef.current?.destroy();
      bindingRef.current = null;
      provider.destroy();
      providerRef.current = null;
    };
  }, [fileId]);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    const provider = providerRef.current;
    if (!provider) return;

    const model = editor.getModel();
    if (!model) return;

    const yText = provider.document.getText("monaco");
    bindingRef.current = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      provider.awareness ?? undefined,
    );

    const errorMarks = editor.createDecorationsCollection();
    onReady?.({
      getCode: () => yText.toString(),
      subscribe: (handler) => {
        const listener = () => handler(yText.toString());
        yText.observe(listener);
        listener();
        return () => yText.unobserve(listener);
      },
      setErrorLine: (line) =>
        errorMarks.set(
          line
            ? [
                {
                  range: new monaco.Range(line, 1, line, 1),
                  options: { isWholeLine: true, className: "run-error-line" },
                },
              ]
            : [],
        ),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
        <span>{readOnly ? "Только чтение" : "Редактирование"}</span>
        <span className="flex items-center gap-3">
          {headerExtra}
          <span>
            {status === "connected" && "● синхронизировано"}
            {status === "connecting" && "○ подключение..."}
            {status === "offline" && "○ офлайн (правки сохранятся локально)"}
          </span>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          key={fileId}
          language={languageFor(language)}
          onMount={handleMount}
          options={{ readOnly, minimap: { enabled: false }, fontSize: 13 }}
          theme="vs"
        />
      </div>
    </div>
  );
}
