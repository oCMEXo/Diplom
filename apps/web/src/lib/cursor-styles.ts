import type { Awareness } from "y-protocols/awareness";

const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#64748b";

/** Awareness comes from other clients, so everything is sanitized before it reaches CSS. */
function safeColor(value: unknown): string {
  return typeof value === "string" && SAFE_COLOR.test(value) ? value : FALLBACK_COLOR;
}

function safeName(value: unknown): string {
  const name = typeof value === "string" ? value : "?";
  return name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 24) || "?";
}

export function remoteCursorCss(awareness: Awareness): string {
  const rules: string[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
    if (!user) return;
    const color = safeColor(user.color);
    const name = safeName(user.name);
    rules.push(
      `.yRemoteSelection-${clientId}{background-color:${color}33}`,
      `.yRemoteSelectionHead-${clientId}{position:absolute;box-sizing:border-box;height:100%;border-left:2px solid ${color}}`,
      `.yRemoteSelectionHead-${clientId}::after{content:"${name}";position:absolute;top:-1.5em;left:-2px;z-index:10;` +
        `padding:1px 5px;border-radius:3px 3px 3px 0;background:${color};color:#fff;font:600 10px/1.3 system-ui,sans-serif;white-space:nowrap}`,
    );
  });
  return rules.join("\n");
}

/** Keeps one <style> element in sync with the participants' cursors. Returns a cleanup function. */
export function installRemoteCursorStyles(awareness: Awareness): () => void {
  const element = document.createElement("style");
  document.head.appendChild(element);
  const render = () => {
    element.textContent = remoteCursorCss(awareness);
  };
  awareness.on("change", render);
  render();
  return () => {
    awareness.off("change", render);
    element.remove();
  };
}
