import { WebSocketServer } from "ws";
import ShareDB from "sharedb";
import WebSocketJSONStream from "@teamwork/websocket-json-stream";
import { serveMetrics } from "./protocol.js";

const backend = new ShareDB();
const wss = new WebSocketServer({ port: Number(process.env.PORT), host: "127.0.0.1" });

wss.on("connection", (socket) => {
  backend.listen(new WebSocketJSONStream(socket));
});

serveMetrics({
  docsize: () => {
    const db = backend.db as unknown as {
      docs: Record<string, Record<string, unknown>>;
      ops: Record<string, Record<string, unknown[]>>;
    };
    const snapshot = db.docs.bench?.doc;
    const ops = db.ops.bench?.doc ?? [];
    return {
      snapshotBytes: snapshot ? Buffer.byteLength(JSON.stringify(snapshot)) : 0,
      historyBytes: Buffer.byteLength(JSON.stringify(ops)),
    };
  },
});

await new Promise<void>((resolve, reject) => {
  const doc = backend.connect().get("bench", "doc");
  doc.create({ text: "", shapes: {} }, (error) => (error ? reject(error) : resolve()));
});

process.send?.({ type: "ready" });
