import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { branchListSchema, branchSwitchResultSchema, branchSwitchSchema, errorResponseSchema } from "@collab/shared";
import { listProjectBranches, switchBranch } from "./branches.service.js";

const params = z.object({ projectId: z.string().uuid() });

export const branchesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/:projectId/branches",
    {
      schema: {
        tags: ["github"],
        params,
        response: {
          200: branchListSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request) => listProjectBranches(request.userId, request.params.projectId),
  );

  app.post(
    "/:projectId/branch",
    {
      schema: {
        tags: ["github"],
        params,
        body: branchSwitchSchema,
        response: {
          200: branchSwitchResultSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          422: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request) => switchBranch(request.userId, request.params.projectId, request.body.name),
  );
};
