import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createFileSchema,
  errorResponseSchema,
  fileSchema,
  trashedFileSchema,
  updateFileSchema,
} from "@collab/shared";
import {
  createFile,
  deleteFile,
  getFile,
  listFiles,
  listTrash,
  purgeFile,
  restoreFile,
  updateFile,
} from "./files.service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const fileParams = z.object({ projectId: z.string().uuid(), fileId: z.string().uuid() });

export const filesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/:projectId/files",
    {
      schema: {
        tags: ["files"],
        params: projectParams,
        response: { 200: z.array(fileSchema), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => listFiles(request.userId, request.params.projectId),
  );

  app.get(
    "/:projectId/files/trash",
    {
      schema: {
        tags: ["files"],
        params: projectParams,
        response: { 200: z.array(trashedFileSchema), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => listTrash(request.userId, request.params.projectId),
  );

  app.post(
    "/:projectId/files/:fileId/restore",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        response: { 200: fileSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => restoreFile(request.userId, request.params.projectId, request.params.fileId),
  );

  app.delete(
    "/:projectId/files/:fileId/permanent",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        response: { 204: z.null(), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await purgeFile(request.userId, request.params.projectId, request.params.fileId);
      return reply.code(204).send(null);
    },
  );

  app.post(
    "/:projectId/files",
    {
      schema: {
        tags: ["files"],
        params: projectParams,
        body: createFileSchema,
        response: {
          201: fileSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const file = await createFile(request.userId, request.params.projectId, request.body);
      return reply.code(201).send(file);
    },
  );

  app.get(
    "/:projectId/files/:fileId",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        response: { 200: fileSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => getFile(request.userId, request.params.projectId, request.params.fileId),
  );

  app.patch(
    "/:projectId/files/:fileId",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        body: updateFileSchema,
        response: {
          200: fileSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) =>
      updateFile(request.userId, request.params.projectId, request.params.fileId, request.body),
  );

  app.delete(
    "/:projectId/files/:fileId",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        response: { 204: z.null(), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await deleteFile(request.userId, request.params.projectId, request.params.fileId);
      return reply.code(204).send(null);
    },
  );
};
