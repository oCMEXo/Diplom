import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, runAcceptedSchema, runRequestSchema } from "@collab/shared";
import { requestRun } from "./runs.service.js";

const params = z.object({ projectId: z.string().uuid(), fileId: z.string().uuid() });

export const runsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/:projectId/files/:fileId/run",
    {
      schema: {
        tags: ["runs"],
        params,
        body: runRequestSchema,
        response: {
          202: runAcceptedSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await requestRun(
        request.userId,
        request.params.projectId,
        request.params.fileId,
        request.body.code,
      );
      return reply.code(202).send(result);
    },
  );
};
