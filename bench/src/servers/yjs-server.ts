import * as Y from "yjs";
import { Server } from "@hocuspocus/server";
import { serveMetrics } from "./protocol.js";

const DOC_NAME = "bench-doc";

const server = Server.configure({
  port: Number(process.env.PORT),
  address: "127.0.0.1",
  quiet: true,
});

serveMetrics({
  docsize: () => {
    const doc = server.documents.get(DOC_NAME);
    return doc ? Y.encodeStateAsUpdate(doc).length : 0;
  },
});

await server.listen();
process.send?.({ type: "ready" });
