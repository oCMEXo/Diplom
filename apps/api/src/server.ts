import { buildApp } from "./app.js";
import { env } from "./env.js";
import { startRunEventRelay } from "./lib/run-events-relay.js";

const app = await buildApp();

const stopRelay = await startRunEventRelay(env.REDIS_URL, (error) => app.log.error(error));
app.addHook("onClose", stopRelay);

app
  .listen({ port: env.PORT, host: env.HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
