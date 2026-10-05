import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, fileVersionContentSchema, fileVersionSchema } from "@collab/shared";
import { getVersion, listVersions, restoreVersion } from "./versions.service.js";

const fileParams = z.object({ projectId: z.string().uuid(), fileId: z.string().uuid() });
const versionParams = fileParams.extend({ versionId: z.string().uuid() });

export const versionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/:projectId/files/:fileId/versions",
    {
      schema: {
        tags: ["files"],
        params: fileParams,
        response: { 200: z.array(fileVersionSchema), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => listVersions(request.userId, request.params.projectId, request.params.fileId),
  );

  app.get(
    "/:projectId/files/:fileId/versions/:versionId",
    {
      schema: {
        tags: ["files"],
        params: versionParams,
        response: { 200: fileVersionContentSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) =>
      getVersion(request.userId, request.params.projectId, request.params.fileId, request.params.versionId),
  );

  app.post(
    "/:projectId/files/:fileId/versions/:versionId/restore",
    {
      schema: {
        tags: ["files"],
        params: versionParams,
        response: {
          204: z.null(),
          403: errorResponseSchema,
          404: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { projectId, fileId, versionId } = request.params;
      await restoreVersion(request.userId, projectId, fileId, versionId);
      return reply.code(204).send(null);
    },
  );
};
