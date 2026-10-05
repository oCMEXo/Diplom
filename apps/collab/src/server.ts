import { env } from "./env.js";
import { createCollabServer } from "./app.js";

createCollabServer({ port: env.PORT, address: env.HOST }).listen();
