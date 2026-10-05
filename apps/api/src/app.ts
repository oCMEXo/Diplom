import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./env.js";
import { authenticatePlugin } from "./plugins/authenticate.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { projectsRoutes } from "./modules/projects/projects.routes.js";
import { inviteRoutes } from "./modules/projects/invite.routes.js";
import { filesRoutes } from "./modules/files/files.routes.js";
import { messagesRoutes } from "./modules/messages/messages.routes.js";
import { realtimeRoutes } from "./modules/realtime/realtime.routes.js";
import { runsRoutes } from "./modules/runs/runs.routes.js";
import { importRoutes } from "./modules/import/import.routes.js";
import { githubRoutes } from "./modules/github/github.routes.js";
import { branchesRoutes } from "./modules/branches/branches.routes.js";
import { terminalRoutes } from "./modules/terminal/terminal.routes.js";
import { closeTerminalTickets } from "./lib/terminal-tickets.js";
import { codeMatches, runMode } from "./lib/run-access.js";
import { featuresSchema, runAccessSchema } from "@collab/shared";
import { closeRunQueue } from "./lib/queue.js";

export interface AppOptions {
  /** Requests per minute per address (0 = unlimited) and the stricter limit for the auth endpoints. */
  rateLimit?: { perMinute: number; authPerMinute: number };
  trustProxy?: boolean;
  runEnabled?: boolean;
  /** Running code and the terminal only for people who know this code (the public test host). */
  runAccessCode?: string;
}

/** Endpoints that cost a password hash or create an account: the ones worth limiting harder. */
const AUTH_LIMITED_URLS = new Set(["/auth/register", "/auth/login", "/auth/guest", "/auth/refresh", "/run-access"]);

export async function buildApp(options: AppOptions = {}) {
  const limits = options.rateLimit ?? { perMinute: env.RATE_LIMIT_PER_MINUTE, authPerMinute: env.RATE_LIMIT_AUTH_PER_MINUTE };
  const runEnabled = options.runEnabled ?? env.RUN_ENABLED;
  const runAccessCode = "runAccessCode" in options ? options.runAccessCode : env.RUN_ACCESS_CODE;
  const app = Fastify({ logger: true, trustProxy: options.trustProxy ?? env.TRUST_PROXY });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    if (error.validation) {
      return reply.code(400).send({ message: "Проверьте введённые данные: что-то заполнено неверно." });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ message: "Internal Server Error" });
  });

  await app.register(cors, { origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()), credentials: true });
  if (limits.perMinute > 0) {
    const authMax = limits.authPerMinute > 0 ? limits.authPerMinute : limits.perMinute;
    // The plugin reads each route's own limit when the route is added, so this hook must come first.
    app.addHook("onRoute", (route) => {
      if (AUTH_LIMITED_URLS.has(route.url) && route.method === "POST") {
        route.config = { ...route.config, rateLimit: { max: authMax, timeWindow: "1 minute" } };
      }
    });
    await app.register(rateLimit, {
      max: limits.perMinute,
      timeWindow: "1 minute",
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        message: `Слишком много запросов. Подождите ${Math.ceil(context.ttl / 1000)} с и попробуйте снова.`,
      }),
    });
  }
  await app.register(websocket);
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

  app.get(
    "/features",
    { schema: { tags: ["runs"], response: { 200: featuresSchema } } },
    async () => ({ run: runMode(runEnabled, runAccessCode) }),
  );
  // Lets the app check the access code before remembering it. Limited like sign-in, so it cannot be guessed.
  app.withTypeProvider<ZodTypeProvider>().post("/run-access", { schema: { tags: ["runs"], body: runAccessSchema } }, async (request, reply) => {
    if (!runEnabled) throw new AppError("Запуск кода на этом сервере выключен", 403);
    if (runAccessCode && !codeMatches(runAccessCode, request.body.code)) throw new AppError("Неверный код доступа", 403);
    return reply.code(204).send();
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(projectsRoutes, { prefix: "/projects" });
  await app.register(filesRoutes, { prefix: "/projects" });
  await app.register(inviteRoutes);
  await app.register(messagesRoutes, { prefix: "/projects" });
  if (runEnabled) {
    await app.register(runsRoutes, { prefix: "/projects", accessCode: runAccessCode });
    await app.register(terminalRoutes, { prefix: "/projects", accessCode: runAccessCode });
  } else {
    // This server does not run visitors' programs; say so instead of queueing a job nobody will take.
    for (const url of ["/projects/:projectId/files/:fileId/run", "/projects/:projectId/terminal"]) {
      app.post(url, { preHandler: [app.authenticate] }, async () => {
        throw new AppError("Запуск кода на этом сервере выключен", 403);
      });
    }
  }
  await app.register(importRoutes, { prefix: "/projects" });
  await app.register(githubRoutes, { prefix: "/projects" });
  await app.register(branchesRoutes, { prefix: "/projects" });
  await app.register(realtimeRoutes);

  app.addHook("onClose", closeRunQueue);
  app.addHook("onClose", closeTerminalTickets);

  return app;
}
