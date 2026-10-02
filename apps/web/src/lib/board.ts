import * as Y from "yjs";

export type ShapeType = "rect" | "ellipse" | "text" | "arrow";

export interface BoardShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  /** Width / height for rect, ellipse and text. */
  w: number;
  h: number;
  /** End point of an arrow (x, y is the start). */
  x2: number;
  y2: number;
  fill: string;
  text: string;
}

export const PALETTE = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fecaca", "#e9d5ff", "#e2e8f0", "#0f172a"];

export const TEXT_SIZE = 18;

/** Pastel fills are too faint for a thin line, so arrows use a deeper shade of the chosen color. */
const ARROW_STROKES: Record<string, string> = {
  "#fde68a": "#d97706",
  "#bfdbfe": "#2563eb",
  "#bbf7d0": "#16a34a",
  "#fecaca": "#dc2626",
  "#e9d5ff": "#9333ea",
  "#e2e8f0": "#475569",
  "#0f172a": "#0f172a",
};

export function arrowStroke(fill: string) {
  return ARROW_STROKES[fill.toLowerCase()] ?? "#475569";
}

export type ShapesMap = Y.Map<Y.Map<unknown>>;
export type OrderArray = Y.Array<string>;

export interface BoardDoc {
  doc: Y.Doc;
  shapes: ShapesMap;
  order: OrderArray;
}

export function openBoard(doc: Y.Doc): BoardDoc {
  return { doc, shapes: doc.getMap("shapes"), order: doc.getArray("order") };
}

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isShapeType(value: unknown): value is ShapeType {
  return value === "rect" || value === "ellipse" || value === "text" || value === "arrow";
}

/** Shapes in layer order (bottom first). Tolerates ids that were deleted or duplicated concurrently. */
export function readShapes({ shapes, order }: BoardDoc): BoardShape[] {
  const seen = new Set<string>();
  const result: BoardShape[] = [];
  for (const id of order.toArray()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = shapes.get(id);
    if (!entry) continue;
    const type = entry.get("type");
    if (!isShapeType(type)) continue;
    result.push({
      id,
      type,
      x: num(entry.get("x")),
      y: num(entry.get("y")),
      w: num(entry.get("w")),
      h: num(entry.get("h")),
      x2: num(entry.get("x2")),
      y2: num(entry.get("y2")),
      fill: str(entry.get("fill"), PALETTE[0]),
      text: str(entry.get("text")),
    });
  }
  return result;
}

export function addShape({ doc, shapes, order }: BoardDoc, shape: BoardShape) {
  doc.transact(() => {
    const entry = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(shape)) {
      if (key !== "id") entry.set(key, value);
    }
    shapes.set(shape.id, entry);
    order.push([shape.id]);
  });
}

export function patchShape({ doc, shapes }: BoardDoc, id: string, patch: Partial<Omit<BoardShape, "id">>) {
  const entry = shapes.get(id);
  if (!entry) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) entry.set(key, value);
  });
}

export function removeShape({ doc, shapes, order }: BoardDoc, id: string) {
  doc.transact(() => {
    shapes.delete(id);
    const ids = order.toArray();
    for (let index = ids.length - 1; index >= 0; index -= 1) {
      if (ids[index] === id) order.delete(index, 1);
    }
  });
}

export function newShapeId() {
  return crypto.randomUUID();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Colors come from other clients, so only well-formed hex values are written into the SVG. */
function safeFill(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#e2e8f0";
}

export function boardBounds(shapes: BoardShape[], padding = 24) {
  if (shapes.length === 0) return { x: 0, y: 0, width: 400, height: 300 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const points =
      s.type === "arrow"
        ? [[s.x, s.y], [s.x2, s.y2]]
        : [[s.x, s.y], [s.x + Math.max(s.w, 1), s.y + Math.max(s.h, 1)]];
    for (const [px, py] of points) {
      minX = Math.min(minX, px!);
      minY = Math.min(minY, py!);
      maxX = Math.max(maxX, px!);
      maxY = Math.max(maxY, py!);
    }
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function shapesToSvg(shapes: BoardShape[]): string {
  const bounds = boardBounds(shapes);
  const body = shapes.map((s) => {
    const fill = safeFill(s.fill);
    switch (s.type) {
      case "rect":
        return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="6" fill="${fill}" stroke="#334155" stroke-width="1.5"/>`;
      case "ellipse":
        return `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${Math.abs(s.w / 2)}" ry="${Math.abs(s.h / 2)}" fill="${fill}" stroke="#334155" stroke-width="1.5"/>`;
      case "arrow":
        return `<line x1="${s.x}" y1="${s.y}" x2="${s.x2}" y2="${s.y2}" stroke="${arrowStroke(fill)}" stroke-width="3" marker-end="url(#arrow-${arrowStroke(fill).slice(1)})"/>`;
      case "text":
        return `<text x="${s.x}" y="${s.y + TEXT_SIZE}" font-family="system-ui, sans-serif" font-size="${TEXT_SIZE}" fill="#0f172a">${escapeXml(s.text)}</text>`;
    }
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">`,
    `<defs>${[...new Set(shapes.filter((s) => s.type === "arrow").map((s) => arrowStroke(safeFill(s.fill))))]
      .map(
        (color) =>
          `<marker id="arrow-${color.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
      )
      .join("")}</defs>`,
    `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>`,
    ...body,
    "</svg>",
  ].join("\n");
}
