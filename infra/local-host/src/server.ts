import http from "node:http";
import httpProxy from "http-proxy";
import sirv from "sirv";

export interface HostOptions {
  /** Folder with the built web app. */
  webRoot: string;
  /** Where `/api/*` goes, e.g. http://127.0.0.1:3201 (the `/api` prefix is removed). */
  apiTarget: string;
  /** Where `/collab` goes, e.g. http://127.0.0.1:3234 (the `/collab` prefix is removed). */
  collabTarget: string;
  /** Where `/terminal` goes (the runner's terminal server); without it there is no terminal. */
  terminalTarget?: string;
}

const PREFIXES = [
  { prefix: "/api", key: "apiTarget" },
  { prefix: "/collab", key: "collabTarget" },
  { prefix: "/terminal", key: "terminalTarget" },
] as const;

/** `/api`, `/api/x` and `/api?x` belong to the API; `/apiary` does not. */
function match(url: string, prefix: string) {
  return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
}

function route(url: string, options: HostOptions) {
  for (const { prefix, key } of PREFIXES) {
    const target = options[key];
    if (target && match(url, prefix)) return { target, rest: url.slice(prefix.length) || "/" };
  }
  return null;
}

const NO_CACHE = new Set(["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/registerSW.js"]);

/**
 * One address for everything: the built web app, the REST API under `/api`, the sync server under
 * `/collab` and the terminals under `/terminal` (WebSockets included). That is what lets a single public tunnel carry the whole site.
 */
export function createHostServer(options: HostOptions) {
  const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true });

  proxy.on("error", (_error, _request, response) => {
    // For plain requests `response` is the HTTP response; for upgrades it is the raw socket.
    if (response instanceof http.ServerResponse) {
      if (!response.headersSent) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      }
      response.end(JSON.stringify({ message: "Сервер сейчас недоступен. Попробуйте через минуту." }));
    } else {
      response.destroy();
    }
  });

  const web = sirv(options.webRoot, {
    single: true,
    etag: true,
    setHeaders(response, pathname) {
      response.setHeader(
        "Cache-Control",
        NO_CACHE.has(pathname) ? "no-cache" : "public, max-age=31536000, immutable",
      );
    },
  });

  const server = http.createServer((request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Frame-Options", "DENY");

    const routed = route(request.url ?? "/", options);
    if (routed) {
      request.url = routed.rest;
      proxy.web(request, response, { target: routed.target });
      return;
    }
    web(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const routed = route(request.url ?? "/", options);
    if (!routed) {
      socket.destroy();
      return;
    }
    request.url = routed.rest;
    proxy.ws(request, socket, head, { target: routed.target });
  });

  server.on("close", () => proxy.close());
  return server;
}
