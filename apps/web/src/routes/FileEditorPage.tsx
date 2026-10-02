import { useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { inferLanguage, toRunnableLanguage, type FileRecord } from "@collab/shared";
import { BoardEditor } from "../components/BoardEditor";
import { CollabEditor, type EditorController } from "../components/CollabEditor";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { RunPanel } from "../components/RunPanel";
import { api, ApiError } from "../lib/api";
import { useRun } from "../lib/RealtimeContext";

interface ProjectOutletContext {
  files: FileRecord[];
  canEdit: boolean;
}

export function FileEditorPage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const { files, canEdit } = useOutletContext<ProjectOutletContext>();
  const file = files.find((f) => f.id === fileId);
  const controller = useRef<EditorController | null>(null);
  const [activeController, setActiveController] = useState<EditorController | null>(null);
  const run = useRun(fileId ?? "");
  const runRef = useRef(run);
  runRef.current = run;
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    controller.current = null;
    setActiveController(null);
    setRunError(null);
  }, [fileId]);

  useEffect(() => {
    if (run?.status === "running") controller.current?.setErrorLine(null);
    else if (run?.status === "error") controller.current?.setErrorLine(run.errorLine);
  }, [run?.runId, run?.status, run?.errorLine]);

  if (!file || !projectId) {
    return <p className="p-6 text-sm text-slate-500">Файл не найден.</p>;
  }

  if (file.type === "board") {
    return (
      <BoardEditor
        key={file.id}
        fileId={file.id}
        readOnly={!canEdit}
        fileName={file.path.split("/").pop() ?? "board"}
      />
    );
  }

  const isDoc = file.type === "doc";
  const language = isDoc ? "markdown" : (file.language ?? inferLanguage(file.path));
  const runnable = !isDoc && toRunnableLanguage(language) !== null;
  const running = run?.status === "running";

  async function startRun() {
    if (!controller.current) return;
    setRunError(null);
    try {
      await api.post(`/projects/${projectId}/files/${file!.id}/run`, {
        code: controller.current.getCode(),
      });
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Не удалось запустить");
    }
  }

  const editor = (
    <CollabEditor
      fileId={file.id}
      language={language}
      readOnly={!canEdit}
      onReady={(c) => {
        controller.current = c;
        setActiveController(c);
        if (runRef.current?.status === "error") c.setErrorLine(runRef.current.errorLine);
      }}
      headerExtra={
        runnable && canEdit ? (
          <span className="flex items-center gap-2">
            {runError && <span className="text-red-600">{runError}</span>}
            <button
              onClick={startRun}
              disabled={running}
              className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-white disabled:opacity-50"
            >
              {running ? "Выполняется…" : "▷ Запустить"}
            </button>
          </span>
        ) : null
      }
    />
  );

  if (isDoc) {
    return (
      <div className="grid h-full grid-cols-2">
        <div className="min-w-0 border-r border-slate-200">{editor}</div>
        <div className="min-w-0">
          <MarkdownPreview controller={activeController} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{editor}</div>
      {runnable && <RunPanel run={run} />}
    </div>
  );
}
