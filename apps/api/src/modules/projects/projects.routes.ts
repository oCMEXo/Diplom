import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createProjectSchema,
  errorResponseSchema,
  inviteLinkSchema,
  inviteMemberSchema,
  projectMemberSchema,
  projectSchema,
  projectWithMembersSchema,
  updateInviteRoleSchema,
  updateMemberRoleSchema,
} from "@collab/shared";
import {
  createProject,
  deleteProject,
  getProject,
  inviteMember,
  listProjects,
  regenerateInviteLink,
  removeMember,
  updateInviteRole,
  updateMemberRole,
} from "./projects.service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const memberParams = z.object({ projectId: z.string().uuid(), userId: z.string().uuid() });

export const projectsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/",
    {
      schema: { tags: ["projects"], body: createProjectSchema, response: { 201: projectSchema } },
    },
    async (request, reply) => {
      const project = await createProject(request.userId, request.body);
      return reply.code(201).send(project);
    },
  );

  app.get(
    "/",
    { schema: { tags: ["projects"], response: { 200: z.array(projectSchema) } } },
    async (request) => listProjects(request.userId),
  );

  app.get(
    "/:projectId",
    {
      schema: {
        tags: ["projects"],
        params: projectParams,
        response: {
          200: projectWithMembersSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => getProject(request.userId, request.params.projectId),
  );

  app.delete(
    "/:projectId",
    {
      schema: {
        tags: ["projects"],
        params: projectParams,
        response: { 204: z.null(), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await deleteProject(request.userId, request.params.projectId);
      return reply.code(204).send(null);
    },
  );

  app.post(
    "/:projectId/members",
    {
      schema: {
        tags: ["projects"],
        params: projectParams,
        body: inviteMemberSchema,
        response: {
          201: projectMemberSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const member = await inviteMember(request.userId, request.params.projectId, request.body);
      return reply.code(201).send(member);
    },
  );

  app.patch(
    "/:projectId/members/:userId",
    {
      schema: {
        tags: ["projects"],
        params: memberParams,
        body: updateMemberRoleSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await updateMemberRole(
        request.userId,
        request.params.projectId,
        request.params.userId,
        request.body.role,
      );
      return reply.code(204).send(null);
    },
  );

  app.post(
    "/:projectId/invite/regenerate",
    {
      schema: {
        tags: ["projects"],
        params: projectParams,
        response: { 200: inviteLinkSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => regenerateInviteLink(request.userId, request.params.projectId),
  );

  app.patch(
    "/:projectId/invite",
    {
      schema: {
        tags: ["projects"],
        params: projectParams,
        body: updateInviteRoleSchema,
        response: { 200: inviteLinkSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => updateInviteRole(request.userId, request.params.projectId, request.body.role),
  );

  app.delete(
    "/:projectId/members/:userId",
    {
      schema: {
        tags: ["projects"],
        params: memberParams,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await removeMember(request.userId, request.params.projectId, request.params.userId);
      return reply.code(204).send(null);
    },
  );
};
