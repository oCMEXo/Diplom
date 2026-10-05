import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { MONACO_THEME } from "../lib/monaco-setup";
import { useTheme } from "../lib/theme";

/**
 * A read-only diff: an earlier version on the left, the text as it is now on the right.
 * Built on Monaco directly so the models are disposed after the editor, not before it
 * (the React wrapper's DiffEditor does it the other way round and Monaco then throws).
 */
export function VersionDiff({ original, modified, language }: { original: string; modified: string; language: string }) {
  const host = useRef<HTMLDivElement>(null);
  const models = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const editor = monaco.editor.createDiffEditor(host.current!, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
      lineHeight: 20,
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    const pair = {
      original: monaco.editor.createModel("", language),
      modified: monaco.editor.createModel("", language),
    };
    editor.setModel(pair);
    models.current = pair;
    return () => {
      models.current = null;
      editor.dispose();
      pair.original.dispose();
      pair.modified.dispose();
    };
  }, [language]);

  useEffect(() => {
    models.current?.original.setValue(original);
  }, [original, language]);

  // The current text changes while people type; an edit (not setValue) keeps the scroll position.
  useEffect(() => {
    const model = models.current?.modified;
    if (model && model.getValue() !== modified) {
      model.applyEdits([{ range: model.getFullModelRange(), text: modified }]);
    }
  }, [modified, language]);

  useEffect(() => {
    monaco.editor.setTheme(MONACO_THEME[theme]);
  }, [theme]);

  return <div ref={host} className="h-full w-full" />;
}
