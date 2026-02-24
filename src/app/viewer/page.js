"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Shape, Stage } from "react-konva";
import { FurnitureNode } from "../../components/layout-viewer/shape-nodes";

const WALL_THICKNESS = 14;

const toPxPoint = (point, size) => ({
  x: point.x * size.width,
  y: point.y * size.height,
});

const dedupeWalls = (walls = []) => {
  const seen = new Set();
  const out = [];

  walls.forEach((wall) => {
    if (!wall?.start || !wall?.end) return;
    const a = `${wall.start.x.toFixed(6)}:${wall.start.y.toFixed(6)}`;
    const b = `${wall.end.x.toFixed(6)}:${wall.end.y.toFixed(6)}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(wall);
  });

  return out;
};

const convertSeatingTableToEditorTable = (table) => {
  const shape = table.shape === "round" ? "circle" : "rectangle";
  const width = table.shape === "round" ? (table?.size?.r || 0.06) * 2 : table?.size?.w || 0.18;
  const height = table.shape === "round" ? (table?.size?.r || 0.06) * 2 : table?.size?.h || 0.12;

  return {
    id: table.id,
    shape,
    x: table?.pos?.x || 0,
    y: table?.pos?.y || 0,
    width,
    height,
    rotation: table.rotation || 0,
    groupId: null,
    seats: table.seats ?? 4,
  };
};

const normalizeLayoutPayload = (raw) => {
  const editorTables = Array.isArray(raw?.editor?.tables) ? raw.editor.tables : [];
  const seatingTables = Array.isArray(raw?.tables) ? raw.tables : [];
  const tables =
    editorTables.length > 0
      ? editorTables
      : seatingTables.map(convertSeatingTableToEditorTable);

  const editorWalls = Array.isArray(raw?.editor?.walls) ? raw.editor.walls : [];
  const walls = editorWalls.length > 0 ? editorWalls : Array.isArray(raw?.walls) ? raw.walls : [];

  return {
    tables,
    walls: dedupeWalls(walls),
  };
};

export default function LayoutViewerPage() {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [layout, setLayout] = useState({ tables: [], walls: [] });
  const [error, setError] = useState("");
  const [sourceName, setSourceName] = useState("");

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const furniture = useMemo(() => layout.tables || [], [layout.tables]);

  const onUploadJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const next = normalizeLayoutPayload(parsed);
        setLayout(next);
        setSourceName(file.name);
        setError("");
      } catch {
        setError("Invalid JSON file. Please upload a valid exported layout JSON.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Layout Viewer</h1>
        <a href="/" className="px-4 py-2 rounded text-white bg-gray-700">
          Open Editor
        </a>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept="application/json,.json"
          onChange={onUploadJson}
          className="block"
        />
        {sourceName && <span className="text-sm text-gray-600">Loaded: {sourceName}</span>}
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div
        ref={containerRef}
        className="w-full h-[700px] border rounded-xl bg-[#e5e7eb]"
      >
        <Stage width={size.width} height={size.height}>
          <Layer>
            <Rect
              x={24}
              y={24}
              width={Math.max(0, size.width - 48)}
              height={Math.max(0, size.height - 48)}
              fill="#f6f7f9"
              stroke="#d7dbe0"
              strokeWidth={2}
              cornerRadius={14}
              listening={false}
            />

            <Shape
              listening={false}
              perfectDrawEnabled={false}
              sceneFunc={(ctx, shape) => {
                ctx.save();
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                ctx.strokeStyle = "#495462";
                ctx.lineWidth = WALL_THICKNESS;
                layout.walls.forEach((wall) => {
                  const start = toPxPoint(wall.start, size);
                  const end = toPxPoint(wall.end, size);
                  ctx.beginPath();
                  ctx.moveTo(start.x, start.y);
                  ctx.lineTo(end.x, end.y);
                  ctx.stroke();
                });

                ctx.strokeStyle = "#6f7d8d";
                ctx.lineWidth = 4;
                layout.walls.forEach((wall) => {
                  const start = toPxPoint(wall.start, size);
                  const end = toPxPoint(wall.end, size);
                  ctx.beginPath();
                  ctx.moveTo(start.x, start.y);
                  ctx.lineTo(end.x, end.y);
                  ctx.stroke();
                });

                ctx.restore();
                ctx.fillStrokeShape(shape);
              }}
            />

            {furniture.map((item, index) => (
              <FurnitureNode
                key={item.id || `item-${index}`}
                item={item}
                canvasSize={size}
                index={index}
              />
            ))}

            {layout.walls.map((wall) => {
              const start = toPxPoint(wall.start, size);
              const end = toPxPoint(wall.end, size);
              return (
                <Line
                  key={`wall-overlay-${wall.id}`}
                  points={[start.x, start.y, end.x, end.y]}
                  stroke="#00000000"
                  strokeWidth={WALL_THICKNESS + 10}
                  listening={false}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
