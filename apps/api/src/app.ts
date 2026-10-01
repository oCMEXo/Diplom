import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { env } from "./env.js";
import { authenticatePlugin } from "./plugins/authenticate.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { projectsRoutes } from "./modules/projects/projects.routes.js";
import { filesRoutes } from "./modules/files/files.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    if (error.validation) {
      return reply.code(400).send({ message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ message: "Internal Server Error" });
  });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(authenticatePlugin);

  await app.register(swagger, {
    openapi: {
      info: { title: "Collab Code Platform API", version: "0.1.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(projectsRoutes, { prefix: "/projects" });
  await app.register(filesRoutes, { prefix: "/projects" });

  return app;
}
