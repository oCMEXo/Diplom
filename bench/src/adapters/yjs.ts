import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { countingSocketClass } from "./counting-socket.js";
import type { DocSize, Shape, SyncClient, SystemDefinition, TrafficCounters } from "./types.js";

const DOC_NAME = "bench-doc";

class YjsClient implements SyncClient {
  private readonly doc = new Y.Doc();
  private readonly provider: HocuspocusProvider;
  private readonly textType: Y.Text;
  private readonly shapesMap: Y.Map<Y.Map<number>>;
  private readonly synced: Promise<void>;

  constructor(
    url: string,
    readonly id: string,
    traffic: TrafficCounters,
  ) {
    this.textType = this.doc.getText("text");
    this.shapesMap = this.doc.getMap("shapes");
    const websocketProvider = new HocuspocusProviderWebsocket({
      url,
      WebSocketPolyfill: countingSocketClass(traffic) as unknown as typeof WebSocket,
    });
    this.provider = new HocuspocusProvider({
      name: DOC_NAME,
      document: this.doc,
      websocketProvider,
    });
    this.synced = new Promise((resolve) => {
      if (this.provider.isSynced) resolve();
      else this.provider.on("synced", () => resolve());
    });
  }

  ready() {
    return this.synced;
  }

  text() {
    return this.textType.toString();
  }

  insert(position: number, text: string) {
    this.textType.insert(Math.min(position, this.textType.length), text);
  }

  deleteRange(position: number, length: number) {
    const start = Math.min(position, this.textType.length);
    const count = Math.min(length, this.textType.length - start);
    if (count > 0) this.textType.delete(start, count);
  }

  onRemoteInsert(handler: (inserted: string) => void) {
    this.textType.observe((event) => {
      if (event.transaction.local) return;
      for (const part of event.delta) {
        if (typeof part.insert === "string") handler(part.insert);
      }
    });
  }

  shapes() {
    const result: Record<string, Shape> = {};
    this.shapesMap.forEach((shape, key) => {
      result[key] = { x: shape.get("x") ?? 0, y: shape.get("y") ?? 0 };
    });
    return result;
  }

  moveShape(shapeId: string, shape: Shape) {
    this.doc.transact(() => {
      let entry = this.shapesMap.get(shapeId);
      if (!entry) {
        entry = new Y.Map<number>();
        this.shapesMap.set(shapeId, entry);
      }
      entry.set("x", shape.x);
      entry.set("y", shape.y);
    });
  }

  onRemoteShape(handler: (shapeId: string) => void) {
    this.shapesMap.observeDeep((events) => {
      for (const event of events) {
        if (event.transaction.local) continue;
        if (event.path.length > 0) handler(String(event.path[0]));
        else for (const key of event.keys.keys()) handler(key);
      }
    });
  }

  async goOffline() {
    this.provider.configuration.websocketProvider.disconnect();
  }

  async goOnline() {
    await this.provider.configuration.websocketProvider.connect();
  }

  async close() {
    this.provider.destroy();
    this.doc.destroy();
  }
}

export const yjsSystem: SystemDefinition = {
  name: "yjs",
  label: "Yjs (CRDT)",
  serverEntry: "servers/yjs-server.ts",
  connect: (url, id, traffic) => new YjsClient(url, id, traffic),
  async docSize(ask): Promise<DocSize> {
    const snapshotBytes = await ask<number>("docsize");
    return { snapshotBytes, historyBytes: 0 };
  },
};
