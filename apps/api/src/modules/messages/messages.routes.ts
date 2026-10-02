import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createMessageSchema,
  errorResponseSchema,
  listMessagesQuerySchema,
  messageSchema,
} from "@collab/shared";
import { createMessage, listMessages } from "./messages.service.js";

const projectParams = z.object({ projectId: z.string().uuid() });

export const messagesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/:projectId/messages",
    {
      schema: {
        tags: ["chat"],
        params: projectParams,
        querystring: listMessagesQuerySchema,
        response: { 200: z.array(messageSchema), 404: errorResponseSchema },
      },
    },
    async (request) => listMessages(request.userId, request.params.projectId, request.query),
  );

  app.post(
    "/:projectId/messages",
    {
      schema: {
        tags: ["chat"],
        params: projectParams,
        body: createMessageSchema,
        response: { 201: messageSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const message = await createMessage(request.userId, request.params.projectId, request.body);
      return reply.code(201).send(message);
    },
  );
};
