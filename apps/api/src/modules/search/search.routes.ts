import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, searchQuerySchema, searchResultSchema } from "@collab/shared";
import { searchProject } from "./search.service.js";

const params = z.object({ projectId: z.string().uuid() });

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/:projectId/search",
    {
      schema: {
        tags: ["files"],
        params,
        querystring: searchQuerySchema,
        response: { 200: searchResultSchema, 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => searchProject(request.userId, request.params.projectId, request.query.q),
  );
};
