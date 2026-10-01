import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import type { FileRecord, FileType, ProjectWithMembers } from "@collab/shared";
import { api } from "../lib/api";
import { FileTree } from "../components/FileTree";
import { MembersPanel } from "../components/MembersPanel";
import { InviteLinkPanel } from "../components/InviteLinkPanel";

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  if (!project || !files) {
    return <p className="p-6 text-sm text-slate-500">Загрузка...</p>;
  }

  const canEdit = project.myRole === "owner" || project.myRole === "editor";

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
            ← проекты
          </Link>
        </div>
        <div className="border-b border-slate-200 p-3">
          <h1 className="truncate text-sm font-semibold text-slate-900">{project.name}</h1>
          <span className="text-xs uppercase text-slate-400">{project.myRole}</span>
        </div>
        <div className="min-h-0 flex-1">
          <FileTree
            projectId={project.id}
            files={files}
            canEdit={canEdit}
            onCreate={(path, type) => createFile.mutate({ path, type })}
          />
        </div>
        <InviteLinkPanel
          projectId={project.id}
          inviteCode={project.inviteCode}
          inviteRole={project.inviteRole}
          isOwner={project.myRole === "owner"}
        />
        <MembersPanel projectId={project.id} members={project.members} isOwner={project.myRole === "owner"} />
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet context={{ files, canEdit }} />
      </main>
    </div>
  );
}
