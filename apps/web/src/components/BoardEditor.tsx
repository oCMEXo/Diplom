import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import type Konva from "konva";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import {
  PALETTE,
  TEXT_SIZE,
  addShape,
  boardBounds,
  newShapeId,
  openBoard,
  patchShape,
  readShapes,
  removeShape,
  shapesToSvg,
  type BoardShape,
  type ShapeType,
} from "../lib/board";
import { useCollabDoc } from "../lib/useCollabDoc";

type Tool = "select" | ShapeType;

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Выбор" },
  { id: "rect", label: "Прямоугольник" },
  { id: "ellipse", label: "Овал" },
  { id: "text", label: "Текст" },
  { id: "arrow", label: "Стрелка" },
];

const SAFE_COLOR = /^#[0-9a-f]{6}$/i;

interface RemoteCursor {
  clientId: number;
  name: string;
  color: string;
  x: number;
  y: number;
}

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

function arrowColor(fill: string) {
  return fill === "#e2e8f0" ? "#334155" : fill;
}

export function BoardEditor({ fileId, readOnly, fileName }: { fileId: string; readOnly: boolean; fileName: string }) {
  const { provider, status } = useCollabDoc(fileId);
  const board = useMemo(() => (provider ? openBoard(provider.document) : null), [provider]);

  const [shapes, setShapes] = useState<BoardShape[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(PALETTE[0]!);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const containerRef = useRef<HTMLDivElement>(null);
  const shapesLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const draft = useRef<{ id: string; startX: number; startY: number; type: ShapeType } | null>(null);
  const lastCursorSent = useRef(0);
  const undoManager = useRef<Y.UndoManager | null>(null);

  const canEdit = !readOnly;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!board) return;
    const refresh = () => setShapes(readShapes(board));
    board.shapes.observeDeep(refresh);
    board.order.observe(refresh);
    refresh();

    const manager = new Y.UndoManager([board.shapes, board.order]);
    undoManager.current = manager;
    return () => {
      board.shapes.unobserveDeep(refresh);
      board.order.unobserve(refresh);
      manager.destroy();
      undoManager.current = null;
    };
  }, [board]);

  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    const refresh = () => {
      const next: RemoteCursor[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state.user as { name?: unknown; color?: unknown } | undefined;
        const cursor = state.cursor as { x?: unknown; y?: unknown } | undefined;
        if (!user || typeof cursor?.x !== "number" || typeof cursor?.y !== "number") return;
        next.push({
          clientId,
          name: typeof user.name === "string" ? user.name.slice(0, 24) : "?",
          color: typeof user.color === "string" && SAFE_COLOR.test(user.color) ? user.color : "#64748b",
          x: cursor.x,
          y: cursor.y,
        });
      });
      setCursors(next);
    };
    awareness.on("change", refresh);
    refresh();
    return () => awareness.off("change", refresh);
  }, [provider]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const layer = shapesLayerRef.current;
    if (!transformer || !layer) return;
    const selected = shapes.find((shape) => shape.id === selectedId);
    const node =
      canEdit && selected && selected.type !== "arrow" && editingId !== selectedId
        ? layer.findOne((candidate: Konva.Node) => candidate.id() === selectedId)
        : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, shapes, canEdit, editingId]);

  const update = useCallback(
    (id: string, patch: Partial<Omit<BoardShape, "id">>) => {
      if (board) patchShape(board, id, patch);
    },
    [board],
  );

  function pointer(event: Konva.KonvaEventObject<MouseEvent>) {
    return event.target.getStage()?.getPointerPosition() ?? { x: 0, y: 0 };
  }

  function handleMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!board || !canEdit) return;
    const onEmptySpace = event.target === event.target.getStage();

    if (tool === "select") {
      if (onEmptySpace) setSelectedId(null);
      return;
    }

    const { x, y } = pointer(event);
    const id = newShapeId();
    const base: BoardShape = { id, type: tool, x, y, w: 0, h: 0, x2: x, y2: y, fill: color, text: "" };

    if (tool === "text") {
      addShape(board, { ...base, w: 220, h: TEXT_SIZE * 1.4 });
      setSelectedId(id);
      setEditingId(id);
      setEditingText("");
      setTool("select");
      return;
    }

    addShape(board, base);
    draft.current = { id, startX: x, startY: y, type: tool };
    setSelectedId(id);
  }

  function handleMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const { x, y } = pointer(event);

    const now = performance.now();
    if (provider && now - lastCursorSent.current > 50) {
      lastCursorSent.current = now;
      provider.setAwarenessField("cursor", { x, y });
    }

    const current = draft.current;
    if (!current) return;
    if (current.type === "arrow") {
      update(current.id, { x2: x, y2: y });
    } else {
      update(current.id, {
        x: Math.min(current.startX, x),
        y: Math.min(current.startY, y),
        w: Math.abs(x - current.startX),
        h: Math.abs(y - current.startY),
      });
    }
  }

  function handleMouseUp() {
    const current = draft.current;
    draft.current = null;
    if (!current || !board) return;
    const shape = readShapes(board).find((candidate) => candidate.id === current.id);
    if (!shape) return;

    if (current.type === "arrow") {
      if (Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) < 10) removeShape(board, current.id);
    } else if (shape.w < 6 && shape.h < 6) {
      update(current.id, { w: 140, h: 90 });
    }
    setTool("select");
  }

  function commitText() {
    if (!board || !editingId) return;
    const id = editingId;
    setEditingId(null);
    if (editingText.trim() === "") removeShape(board, id);
    else update(id, { text: editingText });
  }

  function deleteSelected() {
    if (board && selectedId && canEdit) {
      removeShape(board, selectedId);
      setSelectedId(null);
    }
  }

  function chooseColor(next: string) {
    setColor(next);
    if (selectedId && canEdit) update(selectedId, { fill: next });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (editingId) return;
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      deleteSelected();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) undoManager.current?.redo();
      else undoManager.current?.undo();
    }
  }

  function exportPng() {
    const layer = shapesLayerRef.current;
    if (!layer) return;
    const bounds = boardBounds(shapes);
    const source = layer.toCanvas({ ...bounds, pixelRatio: 2 });
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(source, 0, 0);
    download(output.toDataURL("image/png"), `${fileName}.png`);
  }

  function exportSvg() {
    const blob = new Blob([shapesToSvg(shapes)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    download(url, `${fileName}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const editing = shapes.find((shape) => shape.id === editingId);
  const draggable = canEdit && tool === "select";

  function selectable(id: string) {
    return {
      id,
      draggable,
      onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => {
        if (tool === "select") {
          event.cancelBubble = true;
          setSelectedId(id);
        }
      },
    };
  }

  function renderShape(shape: BoardShape) {
    const common = selectable(shape.id);
    const stroke = selectedId === shape.id && !canEdit ? "#2563eb" : "#334155";

    switch (shape.type) {
      case "rect":
        return (
          <Rect
            key={shape.id}
            {...common}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            cornerRadius={6}
            fill={shape.fill}
            stroke={stroke}
            strokeWidth={1.5}
            onDragMove={(e) => update(shape.id, { x: e.target.x(), y: e.target.y() })}
            onTransformEnd={(e) => {
              const node = e.target;
              const w = Math.max(10, node.width() * node.scaleX());
              const h = Math.max(10, node.height() * node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              update(shape.id, { x: node.x(), y: node.y(), w, h });
            }}
          />
        );
      case "ellipse":
        return (
          <Ellipse
            key={shape.id}
            {...common}
            x={shape.x + shape.w / 2}
            y={shape.y + shape.h / 2}
            radiusX={Math.max(shape.w / 2, 1)}
            radiusY={Math.max(shape.h / 2, 1)}
            fill={shape.fill}
            stroke={stroke}
            strokeWidth={1.5}
            onDragMove={(e) =>
              update(shape.id, { x: e.target.x() - shape.w / 2, y: e.target.y() - shape.h / 2 })
            }
            onTransformEnd={(e) => {
              const node = e.target as Konva.Ellipse;
              const w = Math.max(10, node.radiusX() * 2 * node.scaleX());
              const h = Math.max(10, node.radiusY() * 2 * node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              update(shape.id, { x: node.x() - w / 2, y: node.y() - h / 2, w, h });
            }}
          />
        );
      case "text":
        return (
          <Text
            key={shape.id}
            {...common}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            text={shape.id === editingId ? "" : shape.text || "Текст"}
            fontSize={TEXT_SIZE}
            fill="#0f172a"
            onDblClick={() => {
              if (!canEdit) return;
              setEditingId(shape.id);
              setEditingText(shape.text);
            }}
            onDragMove={(e) => update(shape.id, { x: e.target.x(), y: e.target.y() })}
            onTransformEnd={(e) => {
              const node = e.target;
              const w = Math.max(40, node.width() * node.scaleX());
              node.scaleX(1);
              node.scaleY(1);
              update(shape.id, { x: node.x(), y: node.y(), w });
            }}
          />
        );
      case "arrow": {
        const stroke = arrowColor(shape.fill);
        return (
          <Arrow
            key={shape.id}
            {...common}
            x={0}
            y={0}
            points={[shape.x, shape.y, shape.x2, shape.y2]}
            stroke={stroke}
            fill={stroke}
            strokeWidth={3}
            hitStrokeWidth={14}
            pointerLength={12}
            pointerWidth={12}
            onDragEnd={(e) => {
              const dx = e.target.x();
              const dy = e.target.y();
              e.target.position({ x: 0, y: 0 });
              update(shape.id, { x: shape.x + dx, y: shape.y + dy, x2: shape.x2 + dx, y2: shape.y2 + dy });
            }}
          />
        );
      }
    }
  }

  const selected = shapes.find((shape) => shape.id === selectedId);

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-shape-count={shapes.length}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        {canEdit &&
          TOOLS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTool(item.id)}
              className={`rounded border px-2 py-0.5 ${
                tool === item.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 hover:bg-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        {canEdit && (
          <span className="flex items-center gap-1 pl-1">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                aria-label={`цвет ${swatch}`}
                onClick={() => chooseColor(swatch)}
                style={{ backgroundColor: swatch }}
                className={`h-5 w-5 rounded-full border ${
                  (selected?.fill ?? color) === swatch ? "border-2 border-slate-900" : "border-slate-300"
                }`}
              />
            ))}
          </span>
        )}
        {canEdit && (
          <>
            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-white disabled:opacity-40"
            >
              Удалить
            </button>
            <button
              onClick={() => undoManager.current?.undo()}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-white"
            >
              ↶
            </button>
            <button
              onClick={() => undoManager.current?.redo()}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-white"
            >
              ↷
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button onClick={exportPng} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-white">
            PNG
          </button>
          <button onClick={exportSvg} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-white">
            SVG
          </button>
          <span>
            {readOnly ? "Только чтение · " : ""}
            {status === "connected" && "● синхронизировано"}
            {status === "connecting" && "○ подключение..."}
            {status === "offline" && "○ офлайн (правки сохранятся локально)"}
          </span>
        </span>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => provider?.setAwarenessField("cursor", null)}
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
        >
          <Layer ref={shapesLayerRef}>{shapes.map(renderShape)}</Layer>
          <Layer>
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={false}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]}
            />
            {canEdit && selected?.type === "arrow" && (
              <>
                <Circle
                  x={selected.x}
                  y={selected.y}
                  radius={6}
                  fill="#2563eb"
                  draggable
                  onDragMove={(e) => update(selected.id, { x: e.target.x(), y: e.target.y() })}
                />
                <Circle
                  x={selected.x2}
                  y={selected.y2}
                  radius={6}
                  fill="#2563eb"
                  draggable
                  onDragMove={(e) => update(selected.id, { x2: e.target.x(), y2: e.target.y() })}
                />
              </>
            )}
            {cursors.map((cursor) => (
              <Group key={cursor.clientId} x={cursor.x} y={cursor.y} listening={false}>
                <Line points={[0, 0, 0, 16, 5, 12, 11, 12]} closed fill={cursor.color} stroke="#ffffff" strokeWidth={1} />
                <Rect x={12} y={14} width={cursor.name.length * 7 + 10} height={18} cornerRadius={4} fill={cursor.color} />
                <Text x={17} y={18} text={cursor.name} fontSize={11} fill="#ffffff" />
              </Group>
            ))}
          </Layer>
        </Stage>

        {editing && (
          <textarea
            autoFocus
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                e.preventDefault();
                commitText();
              }
            }}
            style={{
              position: "absolute",
              left: editing.x,
              top: editing.y,
              width: editing.w,
              fontSize: TEXT_SIZE,
              lineHeight: 1,
            }}
            className="resize-none rounded border border-blue-400 bg-white/90 p-0 outline-none"
            rows={2}
          />
        )}
      </div>
    </div>
  );
}
