"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Shape, Stage } from "react-konva";
import { FurnitureNode } from "../../components/layout-viewer/shape-nodes";
import {
  BED_STATUS_OPTIONS,
  getBedVisualStyle,
  getCanonicalBedStatus,
} from "../../components/layout-viewer/bed-status-style";

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
    linkedRoomId: null,
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
  const [focusedRoomId, setFocusedRoomId] = useState(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState("All");

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const furniture = useMemo(() => layout.tables || [], [layout.tables]);
  const isFilterActive = activeStatusFilter !== "All";
  const wallBaseColor = "#495462";
  const wallHighlightColor = "#6f7d8d";

  // ── Room-link highlighting ────────────────────────────────────────────────
  // Set of bed IDs that are linked to the currently focused room label
  const linkedBedIds = useMemo(() => {
    if (!focusedRoomId) return new Set();
    return new Set(
      furniture
        .filter((item) => item.shape === "bed" && item.linkedRoomId === focusedRoomId)
        .map((item) => item.id)
    );
  }, [focusedRoomId, furniture]);

  // Name of the focused room (for the info banner)
  const focusedRoom = useMemo(
    () => furniture.find((item) => item.shape === "room-label" && item.id === focusedRoomId) ?? null,
    [focusedRoomId, furniture]
  );
  // ─────────────────────────────────────────────────────────────────────────

  const bedStatusLegend = useMemo(
    () =>
      BED_STATUS_OPTIONS.map((status) => {
        const canonical = getCanonicalBedStatus(status);
        const style = getBedVisualStyle({ status: canonical, selected: false });
        const isVacant = style.outerFill === "transparent";
        return {
          status: canonical,
          fill: isVacant ? "transparent" : style.outerFill,
          border: isVacant ? "#94a3b8" : style.stripeFill,
          text: isVacant ? "#64748b" : style.stripeFill,
        };
      }),
    []
  );

  const toggleStatusFilter = (status) => {
    setActiveStatusFilter((prev) => (prev === status ? "All" : status));
  };

  const clearFocusedRoom = () => setFocusedRoomId(null);
  const focusRoomLabel = (item) =>
    setFocusedRoomId((prev) => (prev === item.id ? null : item.id));

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
        setFocusedRoomId(null);
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

      <div className="p-2">
        <div className="text-xs font-semibold text-slate-700 mb-2">Bed Status Legend</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveStatusFilter("All")}
            className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border text-xs font-semibold transition ${
              activeStatusFilter === "All"
                ? "border-slate-700 bg-slate-700 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            All
          </button>
          {bedStatusLegend.map((item) => (
            <button
              key={item.status}
              type="button"
              onClick={() => toggleStatusFilter(item.status)}
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border transition ${
                activeStatusFilter === item.status
                  ? "border-slate-900 ring-2 ring-slate-300"
                  : "border-transparent"
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded-full border"
                style={{ backgroundColor: item.fill, borderColor: item.border }}
              />
              <span
                className="text-xs px-2 py-0.5 rounded-full border font-semibold"
                style={{
                  backgroundColor: item.fill,
                  borderColor: item.border,
                  color: item.text,
                }}
              >
                {item.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Room focus info banner ──────────────────────────────────────── */}
      {/* {focusedRoom ? (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-sm">
          <span className="text-amber-600 text-lg">🏠</span>
          <span className="font-semibold text-amber-900">
            {focusedRoom.roomLabel || "Room"}
          </span>
          <span className="text-amber-700">
            — {linkedBedIds.size} linked bed{linkedBedIds.size !== 1 ? "s" : ""} highlighted
          </span>
          <button
            onClick={clearFocusedRoom}
            className="ml-auto text-xs px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-medium transition"
          >
            ✕ Clear
          </button>
        </div>
      ) : (
        furniture.some((item) => item.shape === "room-label") && (
          <div className="text-xs text-gray-400 italic">
            💡 Click a room label on the canvas to highlight its linked beds.
          </div>
        )
      )} */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div
        ref={containerRef}
        className="w-full h-[700px] border rounded-xl bg-[#e5e7eb]"
      >
        <Stage width={size.width} height={size.height}>
          <Layer
            onMouseDown={(e) => {
              const stage = e.target.getStage();
              if (e.target === stage) clearFocusedRoom();
            }}
            onTap={(e) => {
              const stage = e.target.getStage();
              if (e.target === stage) clearFocusedRoom();
            }}
          >
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

                ctx.strokeStyle = wallBaseColor;
                ctx.lineWidth = WALL_THICKNESS;
                layout.walls.forEach((wall) => {
                  const start = toPxPoint(wall.start, size);
                  const end = toPxPoint(wall.end, size);
                  ctx.beginPath();
                  ctx.moveTo(start.x, start.y);
                  ctx.lineTo(end.x, end.y);
                  ctx.stroke();
                });

                ctx.strokeStyle = wallHighlightColor;
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

            {furniture.map((item, index) => {
              const isBed = item.shape === "bed";
              const canonicalStatus = getCanonicalBedStatus(item.bedStatus);
              const mutedByFilter =
                isFilterActive && isBed && canonicalStatus !== activeStatusFilter;
              const renderItem = mutedByFilter ? { ...item, bedStatus: "Vacant" } : item;

              // Room-link highlight logic:
              // If a room is focused:
              //   - linked beds → highlighted (isLinkedBedHighlight = true)
              //   - all other non-room-label items → dimmed (muted = true)
              // If no room focused → normal rendering
              const isRoomLabel = item.shape === "room-label";
              const isFocusedRoom = isRoomLabel && item.id === focusedRoomId;
              const isLinkedBedHighlight = focusedRoomId && isBed && linkedBedIds.has(item.id);
              const isDimmedByRoomFocus =
                focusedRoomId &&
                !isFocusedRoom &&
                !isLinkedBedHighlight;

              return (
                <FurnitureNode
                  key={item.id || `item-${index}`}
                  item={renderItem}
                  canvasSize={size}
                  index={index}
                  muted={mutedByFilter || isDimmedByRoomFocus}
                  isFocused={isFocusedRoom}
                  isLinkedBedHighlight={isLinkedBedHighlight}
                  onClick={
                    isRoomLabel
                      ? () => focusRoomLabel(item)
                      : undefined
                  }
                />
              );
            })}

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
