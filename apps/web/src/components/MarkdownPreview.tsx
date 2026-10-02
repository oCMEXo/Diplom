import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorController } from "./CollabEditor";

export function MarkdownPreview({ controller }: { controller: EditorController | null }) {
  const [text, setText] = useState("");

  useEffect(() => controller?.subscribe(setText), [controller]);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="shrink-0 border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        Предпросмотр
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6 sm:px-10">
        {text.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body mx-auto max-w-2xl">
            {text}
          </ReactMarkdown>
        ) : (
          <p className="mx-auto max-w-2xl text-sm text-faint">
            Начните писать слева — здесь сразу появится оформленный текст.
          </p>
        )}
      </div>
    </div>
  );
}
