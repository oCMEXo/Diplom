import { useOutletContext, useParams } from "react-router-dom";
import type { FileRecord } from "@collab/shared";
import { CollabEditor } from "../components/CollabEditor";

interface ProjectOutletContext {
  files: FileRecord[];
  canEdit: boolean;
}

export function FileEditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const { files, canEdit } = useOutletContext<ProjectOutletContext>();
  const file = files.find((f) => f.id === fileId);

  if (!file) {
    return <p className="p-6 text-sm text-slate-500">Файл не найден.</p>;
  }

  return <CollabEditor fileId={file.id} language={file.language} readOnly={!canEdit} />;
}
