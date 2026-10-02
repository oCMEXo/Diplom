import { useEffect, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import { MONACO_THEME } from "../lib/monaco-setup";
import { installRemoteCursorStyles } from "../lib/cursor-styles";
import { useCollabDoc, type CollabStatus } from "../lib/useCollabDoc";
import { useTheme } from "../lib/theme";
import type { HocuspocusProvider } from "@hocuspocus/provider";

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
  onStatusChange,
  onReady,
}: {
  fileId: string;
  language: string | null;
  readOnly: boolean;
  onStatusChange?: (status: CollabStatus) => void;
  onReady?: (controller: EditorController) => void;
}) {
  const { provider, status } = useCollabDoc(fileId);
  const { theme } = useTheme();
  const bindingRef = useRef<MonacoBinding | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  providerRef.current = provider;
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => onStatusChange?.(status), [status, onStatusChange]);

  useEffect(() => {
    const awareness = provider?.awareness;
    const stop = awareness ? installRemoteCursorStyles(awareness) : undefined;
    return () => {
      stop?.();
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [provider]);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    const current = providerRef.current;
    const model = editor.getModel();
    if (!current || !model) return;

    const yText = current.document.getText("monaco");
    bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), current.awareness ?? undefined);

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

  if (!provider) return null;

  return (
    <Editor
      key={fileId}
      language={languageFor(language)}
      onMount={handleMount}
      theme={MONACO_THEME[theme]}
      loading={<span className="text-sm text-muted">Загружаем редактор…</span>}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13.5,
        fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
        fontLigatures: true,
        lineHeight: 22,
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        renderLineHighlight: "gutter",
        roundedSelection: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        automaticLayout: true,
        wordWrap: language === "markdown" ? "on" : "off",
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
