import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, importGithubSchema, importResultSchema } from "@collab/shared";
import { importFromGithub } from "./import.service.js";

export const importRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/:projectId/import/github",
    {
      schema: {
        tags: ["import"],
        params: z.object({ projectId: z.string().uuid() }),
        body: importGithubSchema,
        response: {
          200: importResultSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          422: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request) => importFromGithub(request.userId, request.params.projectId, request.body.url),
  );
};
