import { Navigate, useOutletContext } from "react-router-dom";
import { GitBranch, UserPlus } from "lucide-react";
import type { FileType } from "@collab/shared";
import { FILE_KINDS } from "../components/layout/ProjectNav";
import { ProjectHeader } from "../components/layout/ProjectHeader";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { pickStartFile } from "../lib/last-file";
import type { ProjectOutletContext } from "./ProjectPage";

const DESCRIPTION: Record<FileType, string> = {
  code: "Редактор с подсветкой, курсорами коллег и запуском кода",
  doc: "Заметки и задания в Markdown с живым предпросмотром",
  board: "Полотно для схем, макетов и мозгового штурма",
};

export function EmptyProjectView() {
  const { project, files, canEdit, shell, createFile, importRepo } = useOutletContext<ProjectOutletContext>();

  // A project that already has files opens on one of them rather than on an empty screen.
  const start = pickStartFile(project.id, files);
  if (start) return <Navigate to={`/projects/${project.id}/files/${start.id}`} replace />;

  return (
    <>
      <ProjectHeader shell={shell} title={project.name} />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-2xl animate-pop text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            {files.length === 0 ? "Здесь пока пусто" : "Выберите файл"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {canEdit
              ? files.length === 0
                ? "Создайте первый файл и позовите коллег — все правки видны сразу у каждого."
                : "Или создайте новый — код, документ или доску. Все правки видны сразу у каждого."
              : "Откройте любой файл из списка, чтобы посмотреть, над чем работает команда."}
          </p>

          {canEdit && (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {(Object.keys(FILE_KINDS) as FileType[]).map((type) => {
                const kind = FILE_KINDS[type];
                return (
                  <button
                    key={type}
                    onClick={() => createFile(type)}
                    className="group flex items-center gap-4 rounded-2xl bg-surface p-4 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-glow sm:flex-col sm:gap-3 sm:p-5 sm:text-center"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-raised transition group-hover:bg-accent/15">
                      <kind.icon size={24} className={cn(kind.tone)} />
                    </span>
                    <span className="min-w-0 sm:contents">
                      <span className="block font-semibold">{kind.label}</span>
                      <span className="block text-xs leading-relaxed text-muted">{DESCRIPTION[type]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {canEdit && (
              <Button variant="primary" onClick={importRepo}>
                <GitBranch size={15} />
                Импортировать из GitHub
              </Button>
            )}
            <Button onClick={shell.openInvite}>
              <UserPlus size={15} />
              Пригласить участников
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
