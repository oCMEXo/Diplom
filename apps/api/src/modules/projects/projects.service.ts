import { prisma } from "@collab/db";
import type { CreateProjectInput, InviteMemberInput, InviteRole, ProjectRole } from "@collab/shared";
import { AppError } from "../../lib/errors.js";
import { requireProjectRole } from "../../lib/authorization.js";
import { generateInviteCode } from "../../lib/invite-code.js";

interface ProjectLike {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  inviteCode: string;
  inviteRole: ProjectRole;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
}

function toProjectDto(project: ProjectLike, myRole: ProjectRole) {
  return {
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    createdAt: project.createdAt.toISOString(),
    myRole,
    inviteCode: project.inviteCode,
    inviteRole: project.inviteRole as InviteRole,
    github:
      project.githubOwner && project.githubRepo
        ? { owner: project.githubOwner, repo: project.githubRepo, branch: project.githubBranch }
        : null,
  };
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const project = await prisma.project.create({
    data: {
      name: input.name,
      ownerId: userId,
      inviteCode: generateInviteCode(),
      members: { create: { userId, role: "owner" } },
    },
  });

  return toProjectDto(project, "owner");
}

export async function listProjects(userId: string) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });

  return memberships.map((m) => toProjectDto(m.project, m.role));
}

export async function getProject(userId: string, projectId: string) {
  const myRole = await requireProjectRole(projectId, userId, "viewer");

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { members: { include: { user: true } } },
  });

  return {
    ...toProjectDto(project, myRole),
    members: project.members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    })),
  };
}

export async function deleteProject(userId: string, projectId: string) {
  await requireProjectRole(projectId, userId, "owner");
  await prisma.project.delete({ where: { id: projectId } });
}

export async function inviteMember(
  requesterId: string,
  projectId: string,
  input: InviteMemberInput,
) {
  await requireProjectRole(projectId, requesterId, "owner");

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("Пользователь с таким email не найден: ему нужно сначала зарегистрироваться", 404);
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (existing) {
    throw new AppError("Этот человек уже в проекте", 409);
  }

  await prisma.projectMember.create({
    data: { projectId, userId: user.id, role: input.role },
  });

  return { userId: user.id, email: user.email, name: user.name, role: input.role };
}

export async function updateMemberRole(
  requesterId: string,
  projectId: string,
  targetUserId: string,
  role: "editor" | "viewer",
) {
  await requireProjectRole(projectId, requesterId, "owner");

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) {
    throw new AppError("Участник не найден", 404);
  }
  if (target.role === "owner") {
    throw new AppError("Роль владельца изменить нельзя", 400);
  }

  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    data: { role },
  });
}

export async function removeMember(
  requesterId: string,
  projectId: string,
  targetUserId: string,
) {
  const requesterRole = await requireProjectRole(projectId, requesterId, "viewer");

  if (requesterId !== targetUserId) {
    if (requesterRole !== "owner") {
      throw new AppError("Убрать других участников может только владелец", 403);
    }
  }

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) {
    throw new AppError("Участник не найден", 404);
  }
  if (target.role === "owner") {
    throw new AppError("Владельца нельзя убрать из проекта: его можно только удалить вместе с проектом", 400);
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
}

export async function regenerateInviteLink(requesterId: string, projectId: string) {
  await requireProjectRole(projectId, requesterId, "owner");

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { inviteCode: generateInviteCode() },
  });

  return { inviteCode: project.inviteCode, inviteRole: project.inviteRole as InviteRole };
}

export async function updateInviteRole(requesterId: string, projectId: string, role: InviteRole) {
  await requireProjectRole(projectId, requesterId, "owner");

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { inviteRole: role },
  });

  return { inviteCode: project.inviteCode, inviteRole: project.inviteRole as InviteRole };
}

export async function previewInvite(inviteCode: string) {
  const project = await prisma.project.findUnique({
    where: { inviteCode },
    include: { owner: { select: { name: true } } },
  });
  if (!project) {
    throw new AppError("Ссылка-приглашение недействительна или устарела", 404);
  }
  return {
    projectName: project.name,
    ownerName: project.owner.name,
    role: project.inviteRole as InviteRole,
  };
}

export async function joinViaInvite(userId: string, inviteCode: string) {
  const project = await prisma.project.findUnique({ where: { inviteCode } });
  if (!project) {
    throw new AppError("Ссылка-приглашение недействительна или устарела", 404);
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  });

  const role = existing?.role ?? (project.inviteRole as ProjectRole);
  if (!existing) {
    await prisma.projectMember.create({
      data: { projectId: project.id, userId, role },
    });
  }

  return toProjectDto(project, role);
}
