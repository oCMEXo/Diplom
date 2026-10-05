/**
 * Server addresses can be absolute ("http://localhost:3001") or relative to the page ("/api"), which
 * is how the app is hosted behind one public address. These helpers turn either form into the
 * URLs the browser needs.
 */

/** The HTTP(S) base of a server, without a trailing slash. */
export function httpBase(base: string, origin: string): string {
  return new URL(base, origin).toString().replace(/\/$/, "");
}

/** A WebSocket URL on the same server: `http` becomes `ws`, `https` becomes `wss`. */
export function wsUrl(base: string, origin: string, path = ""): string {
  const url = new URL(`${httpBase(base, origin)}${path}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
