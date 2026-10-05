import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, terminalTicketSchema } from "@collab/shared";
import { requireRunCode } from "../../lib/run-access.js";
import { openTerminal } from "./terminal.service.js";

const params = z.object({ projectId: z.string().uuid() });

export const terminalRoutes: FastifyPluginAsyncZod<{ accessCode?: string }> = async (app, options) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", requireRunCode(options.accessCode));

  app.post(
    "/:projectId/terminal",
    {
      schema: {
        tags: ["runs"],
        params,
        response: { 201: terminalTicketSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => reply.code(201).send(await openTerminal(request.userId, request.params.projectId)),
  );
};
