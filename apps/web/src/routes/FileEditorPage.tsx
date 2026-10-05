import { useEffect, useRef, useState } from "react";
import { useLocation, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { Eye, LoaderCircle, Play } from "lucide-react";
import { inferLanguage, toRunnableLanguage } from "@collab/shared";
import { BoardEditor } from "../components/BoardEditor";
import { CollabEditor, type EditorController } from "../components/CollabEditor";
import { FileTabs } from "../components/FileTabs";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { RunPanel } from "../components/RunPanel";
import { useRunAccess } from "../components/RunAccess";
import { FILE_KINDS } from "../components/layout/ProjectNav";
import { ProjectHeader, type SyncStatus } from "../components/layout/ProjectHeader";
import { Button } from "../components/ui/Button";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { rememberFile } from "../lib/last-file";
import { useRun } from "../lib/RealtimeContext";
import type { ProjectOutletContext } from "./ProjectPage";

const DEFAULT_TITLE = "Collab — совместная работа над проектом";

export function FileEditorPage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const { files, canEdit, shell, project } = useOutletContext<ProjectOutletContext>();
  const file = files.find((f) => f.id === fileId);
  const controller = useRef<EditorController | null>(null);
  const [activeController, setActiveController] = useState<EditorController | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const run = useRun(fileId ?? "");
  const access = useRunAccess();
  const runRef = useRef(run);
  runRef.current = run;
  const [runError, setRunError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const revealLine = Number(searchParams.get("line")) || null;
  const revealColumn = Number(searchParams.get("col")) || undefined;

  useEffect(() => {
    controller.current = null;
    setActiveController(null);
    setRunError(null);
    setStatus("connecting");
  }, [fileId]);

  // A search result links here with ?line=…; the location key changes even when the same result is clicked twice.
  useEffect(() => {
    if (!activeController || !revealLine) return;
    return activeController.revealLine(revealLine, revealColumn);
  }, [activeController, revealLine, revealColumn, location.key]);

  useEffect(() => {
    if (projectId && fileId) rememberFile(projectId, fileId);
  }, [projectId, fileId]);

  const filePath = file?.path;
  useEffect(() => {
    if (!filePath) return;
    document.title = `${filePath} · ${project.name} — Collab`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [filePath, project.name]);

  useEffect(() => {
    if (run?.status === "running") controller.current?.setErrorLine(null);
    else if (run?.status === "error") controller.current?.setErrorLine(run.errorLine);
  }, [run?.runId, run?.status, run?.errorLine]);

  if (!file || !projectId) {
    return (
      <>
        <ProjectHeader shell={shell} title="Файл не найден" />
        <p className="p-8 text-sm text-muted">Возможно, файл удалили или у вас нет к нему доступа.</p>
      </>
    );
  }

  const kind = FILE_KINDS[file.type];
  const name = file.path.split("/").pop() ?? file.path;
  const header = {
    shell,
    status,
    title: file.path,
    icon: <kind.icon size={17} className={cn("shrink-0", kind.tone)} />,
    badge: !canEdit ? (
      <span className="inline-flex items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 text-[10px] font-medium text-muted">
        <Eye size={10} />
        только чтение
      </span>
    ) : undefined,
  };

  if (file.type === "board") {
    return (
      <>
        <ProjectHeader {...header} />
        <FileTabs projectId={projectId} files={files} activeId={file.id} />
        <div className="min-h-0 flex-1">
          <BoardEditor key={file.id} fileId={file.id} readOnly={!canEdit} fileName={name} onStatusChange={setStatus} />
        </div>
      </>
    );
  }

  const isDoc = file.type === "doc";
  const language = isDoc ? "markdown" : (file.language ?? inferLanguage(file.path));
  const runnable = !!access.mode && access.mode !== "off" && !isDoc && toRunnableLanguage(language) !== null;
  const running = run?.status === "running";

  async function startRun() {
    if (!controller.current) return;
    setRunError(null);
    try {
      await api.post(`/projects/${projectId}/files/${file!.id}/run`, {
        code: controller.current.getCode(),
      });
    } catch (err) {
      if (access.refused(err, () => void startRun())) return;
      setRunError(err instanceof ApiError ? err.message : "Не удалось запустить");
    }
  }

  const editor = (
    <CollabEditor
      fileId={file.id}
      language={language}
      readOnly={!canEdit}
      onStatusChange={setStatus}
      onReady={(c) => {
        controller.current = c;
        setActiveController(c);
        if (runRef.current?.status === "error") c.setErrorLine(runRef.current.errorLine);
      }}
    />
  );

  const actions =
    runnable && canEdit ? (
      <span className="flex items-center gap-2">
        {runError && <span className="text-xs text-bad">{runError}</span>}
        {access.dialog}
        <Button size="sm" onClick={() => access.ensure(() => void startRun())} disabled={running}>
          {running ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={13} className="fill-current text-ok" />}
          {running ? "Выполняется…" : "Запустить"}
        </Button>
      </span>
    ) : undefined;

  if (isDoc) {
    return (
      <>
        <ProjectHeader {...header} actions={actions} />
        <FileTabs projectId={projectId} files={files} activeId={file.id} />
        <div className="grid min-h-0 flex-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
          <div className="min-h-0 min-w-0 border-b border-line md:border-b-0 md:border-r">{editor}</div>
          <div className="min-h-0 min-w-0">
            <MarkdownPreview controller={activeController} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ProjectHeader {...header} actions={actions} />
      <FileTabs projectId={projectId} files={files} activeId={file.id} />
      <div className="min-h-0 flex-1">{editor}</div>
      {runnable && <RunPanel run={run} />}
    </>
  );
}
