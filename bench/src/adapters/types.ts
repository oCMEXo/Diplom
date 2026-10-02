export type SystemName = "yjs" | "sharedb";

export interface TrafficCounters {
  bytesIn: number;
  bytesOut: number;
}

export interface Shape {
  x: number;
  y: number;
}

export interface SyncClient {
  readonly id: string;
  /** Wait until the initial state has been exchanged with the server. */
  ready(): Promise<void>;
  text(): string;
  insert(position: number, text: string): void;
  deleteRange(position: number, length: number): void;
  /** Called with the remotely inserted text of every incoming change. */
  onRemoteInsert(handler: (inserted: string) => void): void;

  shapes(): Record<string, Shape>;
  moveShape(shapeId: string, shape: Shape): void;
  /** Called with the id of every shape changed by a remote client. */
  onRemoteShape(handler: (shapeId: string) => void): void;

  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
  /** Pending local state that has not reached the server yet. */
  close(): Promise<void>;
}

export interface ServerMetrics {
  cpuUserMicros: number;
  cpuSystemMicros: number;
  rssBytes: number;
}

export interface DocSize {
  /** Bytes needed to store the document (snapshot / state), JSON or binary. */
  snapshotBytes: number;
  /** Bytes of operation history kept besides the snapshot (OT only). */
  historyBytes: number;
}

export interface SystemDefinition {
  name: SystemName;
  label: string;
  serverEntry: string;
  connect(url: string, id: string, traffic: TrafficCounters): SyncClient;
  /** Document size as reported by the server. */
  docSize(ask: <T>(message: string) => Promise<T>): Promise<DocSize>;
}
