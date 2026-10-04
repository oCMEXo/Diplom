import { FileCode2, FileText, PenTool, type LucideIcon } from "lucide-react";
import type { FileType } from "@collab/shared";

export const FILE_KINDS: Record<FileType, { label: string; plural: string; icon: LucideIcon; tone: string }> = {
  code: { label: "Код", plural: "Код", icon: FileCode2, tone: "text-[#60a5fa]" },
  doc: { label: "Документ", plural: "Документы", icon: FileText, tone: "text-[#34d399]" },
  board: { label: "Доска", plural: "Доски", icon: PenTool, tone: "text-[#f472b6]" },
};

const TONES_BY_EXTENSION: Record<string, string> = {
  js: "text-[#facc15]",
  mjs: "text-[#facc15]",
  cjs: "text-[#facc15]",
  jsx: "text-[#facc15]",
  ts: "text-[#60a5fa]",
  tsx: "text-[#60a5fa]",
  py: "text-[#4ade80]",
  json: "text-[#fb923c]",
  sol: "text-[#a78bfa]",
  html: "text-[#f87171]",
  css: "text-[#38bdf8]",
  go: "text-[#22d3ee]",
  rs: "text-[#fb923c]",
  java: "text-[#f87171]",
  sh: "text-[#94a3b8]",
  yml: "text-[#94a3b8]",
  yaml: "text-[#94a3b8]",
  env: "text-[#94a3b8]",
  gitignore: "text-[#94a3b8]",
};

/** Icon colour of a file in the tree: by language for code, by kind for documents and boards. */
export function fileTone(path: string, type: FileType): string {
  if (type !== "code") return FILE_KINDS[type].tone;
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return TONES_BY_EXTENSION[extension] ?? FILE_KINDS.code.tone;
}
