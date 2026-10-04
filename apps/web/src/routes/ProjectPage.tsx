import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { FileRecord, FileType, ProjectWithMembers } from "@collab/shared";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { RealtimeProvider } from "../lib/RealtimeContext";
import { CreateFileDialog } from "../components/CreateFileDialog";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { DeleteFileDialog } from "../components/DeleteFileDialog";
import { ImportGithubDialog } from "../components/ImportGithubDialog";
import { PushGithubDialog } from "../components/PushGithubDialog";
import { QuickOpen } from "../components/QuickOpen";
import { RenameFileDialog } from "../components/RenameFileDialog";
import { InviteDialog } from "../components/InviteDialog";
import { ProjectNav } from "../components/layout/ProjectNav";
import { SidePanel } from "../components/layout/SidePanel";
import type { ShellActions } from "../components/layout/ProjectHeader";
import { ErrorScreen } from "../components/ui/ErrorScreen";
import { FullScreenLoader } from "../components/ui/Spinner";

export interface ProjectOutletContext {
  files: FileRecord[];
  canEdit: boolean;
  project: ProjectWithMembers;
  shell: ShellActions;
  createFile: (type: FileType) => void;
  importRepo: () => void;
}

const WIDE = "(min-width: 1280px)";

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [navOpen, setNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(WIDE).matches);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creatingFile, setCreatingFile] = useState<FileType | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [deletingFile, setDeletingFile] = useState<FileRecord | null>(null);
  const [renamingFile, setRenamingFile] = useState<FileRecord | null>(null);
  const [searching, setSearching] = useState(false);

  // Ctrl+P (or Ctrl+K) opens "go to file" instead of the browser's print dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ["p", "k"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The mobile drawers should not stay open after moving to another page.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const { data: project, error: projectError, refetch: refetchProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<ProjectWithMembers>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data: files, error: filesError, refetch: refetchFiles } = useQuery({
    queryKey: ["files", projectId],
    queryFn: () => api.get<FileRecord[]>(`/projects/${projectId}/files`),
    enabled: !!projectId,
  });

  const createFile = useMutation({
    mutationFn: (input: { path: string; type: FileType }) =>
      api.post<FileRecord>(`/projects/${projectId}/files`, input),
    onSuccess: (file) => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      navigate(`/projects/${projectId}/files/${file.id}`);
    },
  });

  const loadError = projectError ?? filesError;
  if ((!project || !files) && loadError) {
    const missing = loadError instanceof ApiError && (loadError.status === 404 || loadError.status === 403);
    return (
      <ErrorScreen
        title={missing ? "Проект недоступен" : "Не удалось открыть проект"}
        message={
          missing
            ? "Проекта нет или у вас нет к нему доступа: возможно, ссылка устарела или вас убрали из участников."
            : "Похоже, нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
        }
        onRetry={
          missing
            ? undefined
            : () => {
                void refetchProject();
                void refetchFiles();
              }
        }
      />
    );
  }
  if (!project || !files) return <FullScreenLoader label="Открываем проект…" />;

  const canEdit = project.myRole === "owner" || project.myRole === "editor";
  const shell: ShellActions = {
    openNav: () => setNavOpen(true),
    togglePanel: () => setPanelOpen((value) => !value),
    panelOpen,
    openInvite: () => setInviteOpen(true),
  };

  return (
    <RealtimeProvider key={project.id} projectId={project.id}>
      <div className="flex h-screen overflow-hidden">
        {navOpen && (
          <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in lg:hidden" onClick={() => setNavOpen(false)} />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 shrink-0 transition-transform duration-200 lg:static lg:translate-x-0",
            navOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <ProjectNav
            project={project}
            files={files}
            canEdit={canEdit}
            onCreateFile={setCreatingFile}
            onCreateProject={() => setCreatingProject(true)}
            onInvite={() => setInviteOpen(true)}
            onImport={() => setImporting(true)}
            onPush={() => setPushing(true)}
            onDeleteFile={setDeletingFile}
            onRenameFile={setRenamingFile}
            onSearch={() => setSearching(true)}
            onNavigate={() => setNavOpen(false)}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet
            context={
              {
                files,
                canEdit,
                project,
                shell,
                createFile: setCreatingFile,
                importRepo: () => setImporting(true),
              } satisfies ProjectOutletContext
            }
          />
        </main>

        {panelOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in xl:hidden" onClick={shell.togglePanel} />
            <aside className="fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] border-l border-line animate-slide-in xl:static xl:z-auto">
              <SidePanel project={project} onInvite={shell.openInvite} onClose={shell.togglePanel} />
            </aside>
          </>
        )}
      </div>

      {inviteOpen && <InviteDialog project={project} onClose={() => setInviteOpen(false)} />}
      {importing && <ImportGithubDialog project={project} onClose={() => setImporting(false)} />}
      {pushing && <PushGithubDialog project={project} onClose={() => setPushing(false)} />}
      {searching && (
        <QuickOpen
          files={files}
          onClose={() => setSearching(false)}
          onOpen={(file) => {
            setSearching(false);
            navigate(`/projects/${project.id}/files/${file.id}`);
          }}
        />
      )}
      {renamingFile && (
        <RenameFileDialog projectId={project.id} file={renamingFile} files={files} onClose={() => setRenamingFile(null)} />
      )}
      {deletingFile && (
        <DeleteFileDialog
          projectId={project.id}
          file={deletingFile}
          onClose={() => setDeletingFile(null)}
          onDeleted={() => {
            const wasOpen = location.pathname.endsWith(`/files/${deletingFile.id}`);
            setDeletingFile(null);
            if (wasOpen) navigate(`/projects/${project.id}`);
          }}
        />
      )}
      {creatingFile && (
        <CreateFileDialog
          initialType={creatingFile}
          files={files}
          onClose={() => setCreatingFile(null)}
          onCreate={(path, type) => createFile.mutate({ path, type })}
        />
      )}
      {creatingProject && (
        <CreateProjectDialog
          onClose={() => setCreatingProject(false)}
          onCreated={(created) => {
            setCreatingProject(false);
            navigate(`/projects/${created.id}`);
          }}
        />
      )}
    </RealtimeProvider>
  );
}
