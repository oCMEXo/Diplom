import { z } from "zod";
import { PROJECT_ROLES } from "../constants.js";

export const projectRoleSchema = z.enum(PROJECT_ROLES);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const projectMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: projectRoleSchema,
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const inviteRoleSchema = z.enum(["editor", "viewer"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const githubLinkSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  /** `null` means the repository's default branch. */
  branch: z.string().nullable(),
});
export type GithubLink = z.infer<typeof githubLinkSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime(),
  myRole: projectRoleSchema,
  inviteCode: z.string(),
  inviteRole: inviteRoleSchema,
  github: githubLinkSchema.nullable(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectWithMembersSchema = projectSchema.extend({
  members: z.array(projectMemberSchema),
});
export type ProjectWithMembers = z.infer<typeof projectWithMembersSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: inviteRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: inviteRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const updateInviteRoleSchema = z.object({
  role: inviteRoleSchema,
});
export type UpdateInviteRoleInput = z.infer<typeof updateInviteRoleSchema>;

export const inviteLinkSchema = z.object({
  inviteCode: z.string(),
  inviteRole: inviteRoleSchema,
});
export type InviteLink = z.infer<typeof inviteLinkSchema>;
