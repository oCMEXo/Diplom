import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, pushGithubSchema, pushResultSchema } from "@collab/shared";
import { pushToGithub } from "./github.service.js";

export const githubRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/:projectId/github/push",
    {
      schema: {
        tags: ["github"],
        params: z.object({ projectId: z.string().uuid() }),
        body: pushGithubSchema,
        response: {
          200: pushResultSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request) => pushToGithub(request.userId, request.params.projectId, request.body),
  );
};
