import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, projectSchema } from "@collab/shared";
import { joinViaInvite } from "./projects.service.js";

const joinParams = z.object({ code: z.string().min(1) });

export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/join/:code",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["projects"],
        security: [{ bearerAuth: [] }],
        params: joinParams,
        response: { 200: projectSchema, 404: errorResponseSchema },
      },
    },
    async (request) => joinViaInvite(request.userId, request.params.code),
  );
};
