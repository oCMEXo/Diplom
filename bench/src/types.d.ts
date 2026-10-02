declare module "@teamwork/websocket-json-stream" {
  import type { Duplex } from "node:stream";
  import type WebSocket from "ws";

  export default class WebSocketJSONStream extends Duplex {
    constructor(socket: WebSocket);
  }
}
