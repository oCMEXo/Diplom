import { FileCode2, FileText, PenTool, type LucideIcon } from "lucide-react";
import type { FileType } from "@collab/shared";

export const FILE_KINDS: Record<FileType, { label: string; plural: string; icon: LucideIcon; tone: string }> = {
  code: { label: "Код", plural: "Код", icon: FileCode2, tone: "text-[#60a5fa]" },
  doc: { label: "Документ", plural: "Документы", icon: FileText, tone: "text-[#34d399]" },
  board: { label: "Доска", plural: "Доски", icon: PenTool, tone: "text-[#f472b6]" },
};
