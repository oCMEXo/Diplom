import { createRequire } from "node:module";
import type * as ShareDBClient from "sharedb/lib/client/index.js";
import { countingSocketClass } from "./counting-socket.js";
import type { DocSize, Shape, SyncClient, SystemDefinition, TrafficCounters } from "./types.js";

const require = createRequire(import.meta.url);
const ShareDB = require("sharedb/lib/client") as typeof ShareDBClient;

interface BenchDoc {
  text: string;
  shapes: Record<string, Shape>;
}

type OpComponent = { p: (string | number)[]; si?: string };

class ShareDbClient implements SyncClient {
  private socket: WebSocket;
  private readonly connection: ShareDBClient.Connection;
  private readonly doc: ShareDBClient.Doc<BenchDoc>;
  private readonly Socket: ReturnType<typeof countingSocketClass>;
  private readonly synced: Promise<void>;

  constructor(
    private readonly url: string,
    readonly id: string,
    traffic: TrafficCounters,
  ) {
    this.Socket = countingSocketClass(traffic);
    this.socket = new this.Socket(url) as unknown as WebSocket;
    this.connection = new ShareDB.Connection(this.socket as never);
    this.doc = this.connection.get("bench", "doc") as ShareDBClient.Doc<BenchDoc>;
    this.synced = new Promise((resolve, reject) => {
      this.doc.subscribe((error) => (error ? reject(error) : resolve()));
    });
  }

  ready() {
    return this.synced;
  }

  text() {
    return this.doc.data.text;
  }

  insert(position: number, text: string) {
    const at = Math.min(position, this.doc.data.text.length);
    this.doc.submitOp([{ p: ["text", at], si: text }]);
  }

  deleteRange(position: number, length: number) {
    const current = this.doc.data.text;
    const start = Math.min(position, current.length);
    const removed = current.slice(start, start + length);
    if (removed) this.doc.submitOp([{ p: ["text", start], sd: removed }]);
  }

  onRemoteInsert(handler: (inserted: string) => void) {
    this.doc.on("op", (ops: unknown, source: unknown) => {
      if (source) return;
      for (const component of ops as OpComponent[]) {
        if (component.p[0] === "text" && typeof component.si === "string") handler(component.si);
      }
    });
  }

  shapes() {
    return structuredClone(this.doc.data.shapes ?? {});
  }

  moveShape(shapeId: string, shape: Shape) {
    const existing = this.doc.data.shapes?.[shapeId];
    if (!existing) {
      this.doc.submitOp([{ p: ["shapes", shapeId], oi: shape }]);
      return;
    }
    this.doc.submitOp([
      { p: ["shapes", shapeId, "x"], od: existing.x, oi: shape.x },
      { p: ["shapes", shapeId, "y"], od: existing.y, oi: shape.y },
    ]);
  }

  onRemoteShape(handler: (shapeId: string) => void) {
    this.doc.on("op", (ops: unknown, source: unknown) => {
      if (source) return;
      for (const component of ops as OpComponent[]) {
        if (component.p[0] === "shapes" && component.p[1] !== undefined) {
          handler(String(component.p[1]));
        }
      }
    });
  }

  async goOffline() {
    const closed = new Promise<void>((resolve) => this.connection.once("disconnected", () => resolve()));
    this.socket.close();
    await closed;
  }

  async goOnline() {
    this.socket = new this.Socket(this.url) as unknown as WebSocket;
    const connected = new Promise<void>((resolve) =>
      this.connection.once("connected", () => resolve()),
    );
    (this.connection as unknown as { bindToSocket(socket: unknown): void }).bindToSocket(this.socket);
    await connected;
  }

  async close() {
    this.connection.close();
  }
}

export const shareDbSystem: SystemDefinition = {
  name: "sharedb",
  label: "ShareDB (OT)",
  serverEntry: "servers/sharedb-server.ts",
  connect: (url, id, traffic) => new ShareDbClient(url, id, traffic),
  async docSize(ask): Promise<DocSize> {
    return ask<DocSize>("docsize");
  },
};
