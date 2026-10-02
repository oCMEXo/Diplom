import { RUNNABLE_LANGUAGES, type RunnableLanguage } from "./constants.js";

const EXTENSION_LANGUAGES: Record<string, string> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  html: "html",
  css: "css",
  sql: "sql",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  java: "java",
  c: "c",
  cpp: "cpp",
  go: "go",
  rs: "rust",
};

export function inferLanguage(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXTENSION_LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function toRunnableLanguage(language: string | null): RunnableLanguage | null {
  return (RUNNABLE_LANGUAGES as readonly string[]).includes(language ?? "")
    ? (language as RunnableLanguage)
    : null;
}
