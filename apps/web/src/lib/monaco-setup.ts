import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

export const MONACO_THEME = { dark: "collab-dark", light: "collab-light" } as const;

monaco.editor.defineTheme(MONACO_THEME.dark, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5c6478", fontStyle: "italic" },
    { token: "keyword", foreground: "b9a8ff" },
    { token: "string", foreground: "7ee3b0" },
    { token: "number", foreground: "ffb86b" },
    { token: "type", foreground: "7cc4ff" },
    { token: "delimiter", foreground: "8e96aa" },
  ],
  colors: {
    "editor.background": "#0d1016",
    "editor.foreground": "#e6e9f1",
    "editorLineNumber.foreground": "#444b5e",
    "editorLineNumber.activeForeground": "#9aa3ba",
    "editor.lineHighlightBackground": "#151923",
    "editor.lineHighlightBorder": "#151923",
    "editor.selectionBackground": "#7c6cff40",
    "editorCursor.foreground": "#a99cff",
    "editorIndentGuide.background1": "#1c2130",
    "editorIndentGuide.activeBackground1": "#2d3448",
    "editorWidget.background": "#13161e",
    "editorSuggestWidget.background": "#13161e",
    "scrollbarSlider.background": "#28324066",
  },
});

monaco.editor.defineTheme(MONACO_THEME.light, {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8a93a8", fontStyle: "italic" },
    { token: "keyword", foreground: "5b4bff" },
    { token: "string", foreground: "0f9d6b" },
    { token: "number", foreground: "d97706" },
    { token: "type", foreground: "0b7bd6" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#12151e",
    "editorLineNumber.foreground": "#b4bacb",
    "editorLineNumber.activeForeground": "#5c6478",
    "editor.lineHighlightBackground": "#f6f7fb",
    "editor.lineHighlightBorder": "#f6f7fb",
    "editor.selectionBackground": "#5b4bff30",
    "editorCursor.foreground": "#5b4bff",
  },
});
