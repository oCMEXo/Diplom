import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  addShape,
  boardBounds,
  openBoard,
  patchShape,
  readShapes,
  removeShape,
  shapesToSvg,
  type BoardShape,
} from "./board";

function shape(overrides: Partial<BoardShape> = {}): BoardShape {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    x2: 0,
    y2: 0,
    fill: "#bfdbfe",
    text: "",
    ...overrides,
  };
}

function syncBoth(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

describe("board model", () => {
  it("reads shapes back in layer order", () => {
    const board = openBoard(new Y.Doc());
    const first = shape({ x: 1 });
    const second = shape({ x: 2 });
    addShape(board, first);
    addShape(board, second);

    expect(readShapes(board).map((s) => s.id)).toEqual([first.id, second.id]);
    expect(readShapes(board)[0]).toMatchObject({ type: "rect", x: 1, w: 100, fill: "#bfdbfe" });
  });

  it("patches and removes shapes", () => {
    const board = openBoard(new Y.Doc());
    const item = shape();
    addShape(board, item);

    patchShape(board, item.id, { x: 99, text: "hi" });
    expect(readShapes(board)[0]).toMatchObject({ x: 99, text: "hi" });

    removeShape(board, item.id);
    expect(readShapes(board)).toHaveLength(0);
  });

  it("merges concurrent edits of different properties of one shape", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const boardA = openBoard(docA);
    const boardB = openBoard(docB);
    const item = shape();
    addShape(boardA, item);
    syncBoth(docA, docB);

    patchShape(boardA, item.id, { x: 500 });
    patchShape(boardB, item.id, { fill: "#fecaca" });
    syncBoth(docA, docB);

    expect(readShapes(boardA)).toEqual(readShapes(boardB));
    expect(readShapes(boardA)[0]).toMatchObject({ x: 500, fill: "#fecaca" });
  });

  it("converges when two clients move the same shape (last writer wins per property)", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const boardA = openBoard(docA);
    const boardB = openBoard(docB);
    const item = shape();
    addShape(boardA, item);
    syncBoth(docA, docB);

    patchShape(boardA, item.id, { x: 111, y: 1 });
    patchShape(boardB, item.id, { x: 222, y: 2 });
    syncBoth(docA, docB);

    const [fromA] = readShapes(boardA);
    const [fromB] = readShapes(boardB);
    expect(fromA).toEqual(fromB);
    expect([111, 222]).toContain(fromA!.x);
  });

  it("survives a concurrent delete and edit", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const boardA = openBoard(docA);
    const boardB = openBoard(docB);
    const item = shape();
    addShape(boardA, item);
    syncBoth(docA, docB);

    removeShape(boardA, item.id);
    patchShape(boardB, item.id, { x: 5 });
    syncBoth(docA, docB);

    expect(readShapes(boardA)).toEqual(readShapes(boardB));
  });

  it("ignores ids that appear twice in the layer order", () => {
    const board = openBoard(new Y.Doc());
    const item = shape();
    addShape(board, item);
    board.order.push([item.id]);

    expect(readShapes(board)).toHaveLength(1);
  });
});

describe("shapesToSvg", () => {
  it("escapes text so a shape cannot inject markup", () => {
    const svg = shapesToSvg([shape({ type: "text", text: '</text><script>alert(1)</script>"' })]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("only writes well-formed colors", () => {
    const svg = shapesToSvg([shape({ fill: '" onload="alert(1)' })]);
    expect(svg).not.toContain("onload");
    expect(svg).toContain('fill="#e2e8f0"');
  });

  it("renders every shape type and a viewBox that fits them", () => {
    const shapes = [
      shape({ type: "rect", x: 0, y: 0, w: 100, h: 50 }),
      shape({ type: "ellipse", x: 200, y: 0, w: 80, h: 80 }),
      shape({ type: "arrow", x: 0, y: 100, x2: 300, y2: 200 }),
      shape({ type: "text", x: 50, y: 300, text: "метка" }),
    ];
    const svg = shapesToSvg(shapes);
    for (const tag of ["<rect", "<ellipse", "<line", "<text"]) expect(svg).toContain(tag);
    expect(svg).toContain("метка");

    const bounds = boardBounds(shapes);
    expect(bounds.x).toBeLessThan(0);
    expect(bounds.width).toBeGreaterThan(300);
  });

  it("has a sensible empty board", () => {
    expect(boardBounds([]).width).toBeGreaterThan(0);
  });
});
