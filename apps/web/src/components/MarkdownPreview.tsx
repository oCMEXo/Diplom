import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorController } from "./CollabEditor";

export function MarkdownPreview({ controller }: { controller: EditorController | null }) {
  const [text, setText] = useState("");

  useEffect(() => controller?.subscribe(setText), [controller]);

  return (
    <div className="h-full overflow-auto bg-white p-6">
      {text.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
          {text}
        </ReactMarkdown>
      ) : (
        <p className="text-sm text-slate-400">Предпросмотр появится, когда в документе будет текст</p>
      )}
    </div>
  );
}
