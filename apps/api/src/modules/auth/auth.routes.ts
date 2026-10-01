import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  authResponseSchema,
  errorResponseSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from "@collab/shared";
import {
  AuthError,
  loginUser,
  refreshSession,
  registerUser,
  revokeRefreshToken,
} from "./auth.service.js";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        tags: ["auth"],
        body: registerSchema,
        response: { 201: authResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const result = await registerUser(request.body);
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode as 409).send({ message: err.message });
        }
        throw err;
      }
    },
  );

  app.post(
    "/login",
    {
      schema: {
        tags: ["auth"],
        body: loginSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const result = await loginUser(request.body);
        return reply.send(result);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode as 401).send({ message: err.message });
        }
        throw err;
      }
    },
  );

  app.post(
    "/refresh",
    {
      schema: {
        tags: ["auth"],
        body: refreshSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const result = await refreshSession(request.body.refreshToken);
        return reply.send(result);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode as 401).send({ message: err.message });
        }
        throw err;
      }
    },
  );

  app.post(
    "/logout",
    {
      schema: {
        tags: ["auth"],
        body: refreshSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await revokeRefreshToken(request.body.refreshToken);
      return reply.code(204).send(null);
    },
  );

  app.get(
    "/me",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ userId: z.string().uuid() }),
        },
      },
    },
    async (request, reply) => {
      return reply.send({ userId: request.userId });
    },
  );
};
