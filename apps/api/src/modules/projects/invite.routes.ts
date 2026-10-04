import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, invitePreviewSchema, projectSchema } from "@collab/shared";
import { joinViaInvite, previewInvite } from "./projects.service.js";

const joinParams = z.object({ code: z.string().min(1) });

export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  // Public on purpose: the person following the link needs to see where it leads before signing in.
  app.get(
    "/join/:code",
    {
      schema: {
        tags: ["projects"],
        params: joinParams,
        response: { 200: invitePreviewSchema, 404: errorResponseSchema },
      },
    },
    async (request) => previewInvite(request.params.code),
  );

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
