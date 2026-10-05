import { describe, expect, it } from "vitest";
import { httpBase, wsUrl } from "./endpoints";

describe("httpBase", () => {
  it("keeps an absolute address and drops a trailing slash", () => {
    expect(httpBase("http://localhost:3001", "https://app.example")).toBe("http://localhost:3001");
    expect(httpBase("https://api.example/", "https://app.example")).toBe("https://api.example");
  });

  it("resolves a relative address against the page", () => {
    expect(httpBase("/api", "https://abc.trycloudflare.com")).toBe("https://abc.trycloudflare.com/api");
  });
});

describe("wsUrl", () => {
  it("uses ws for http and wss for https", () => {
    expect(wsUrl("http://localhost:3001", "http://localhost:5173", "/ws")).toBe("ws://localhost:3001/ws");
    expect(wsUrl("https://api.example", "https://app.example", "/ws")).toBe("wss://api.example/ws");
  });

  it("keeps the path prefix of a relative address", () => {
    expect(wsUrl("/api", "https://abc.trycloudflare.com", "/ws")).toBe("wss://abc.trycloudflare.com/api/ws");
    expect(wsUrl("/collab", "http://127.0.0.1:8787")).toBe("ws://127.0.0.1:8787/collab");
  });
});
