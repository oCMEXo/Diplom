export interface ServerRequest {
  id: number;
  type: "metrics" | "docsize";
}

export interface ServerResponse {
  id: number;
  result: unknown;
}

export function serveMetrics(handlers: { docsize: () => unknown }) {
  process.on("message", (message: ServerRequest) => {
    let result: unknown;
    if (message.type === "metrics") {
      const cpu = process.cpuUsage();
      result = {
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
        rssBytes: process.memoryUsage().rss,
      };
    } else if (message.type === "docsize") {
      result = handlers.docsize();
    }
    process.send?.({ id: message.id, result } satisfies ServerResponse);
  });
}
