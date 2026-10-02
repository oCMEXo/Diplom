import WebSocket from "ws";
import type { TrafficCounters } from "./types.js";

function byteLength(data: WebSocket.RawData | string): number {
  if (typeof data === "string") return Buffer.byteLength(data);
  if (Array.isArray(data)) return data.reduce((sum, part) => sum + part.length, 0);
  return data.byteLength;
}

export function countingSocketClass(counters: TrafficCounters) {
  return class CountingSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols);
      this.on("message", (data) => {
        counters.bytesIn += byteLength(data);
      });
    }

    send(data: unknown, ...rest: unknown[]) {
      counters.bytesOut += byteLength(data as WebSocket.RawData | string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (super.send as any)(data, ...rest);
    }
  };
}
