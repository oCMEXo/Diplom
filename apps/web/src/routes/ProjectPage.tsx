import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { FileRecord, FileType, ProjectWithMembers } from "@collab/shared";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { RealtimeProvider } from "../lib/RealtimeContext";
import { CreateFileDialog } from "../components/CreateFileDialog";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { ImportGithubDialog } from "../components/ImportGithubDialog";
import { InviteDialog } from "../components/InviteDialog";
import { ProjectNav } from "../components/layout/ProjectNav";
import { SidePanel } from "../components/layout/SidePanel";
import type { ShellActions } from "../components/layout/ProjectHeader";
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

  // The mobile drawers should not stay open after moving to another page.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<ProjectWithMembers>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data: files } = useQuery({
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
      {importing && <ImportGithubDialog projectId={project.id} onClose={() => setImporting(false)} />}
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
