import { env } from "./env.js";
import { createHocuspocus } from "./hocuspocus.js";
import { startAccessChangeListener } from "./lib/access-changes.js";

const server = createHocuspocus({ port: env.PORT, address: env.HOST });

// Access is checked on connect; the API tells us when it is taken away from open documents.
await startAccessChangeListener(env.REDIS_URL, server, (error) => console.error(error));

server.listen();
