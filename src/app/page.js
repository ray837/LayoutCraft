"use client";

import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Group,
  Text,
  Transformer,
  Shape,
} from "react-konva";
import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  BED_STATUS_OPTIONS,
  getBedVisualStyle,
  getCanonicalBedStatus,
} from "@/components/layout-viewer/bed-status-style";

const SNAP_PX = 14;
const MIN_WALL_LENGTH = 10;
const WALL_THICKNESS = 14;
const AXIS_LOCK_THRESHOLD = 6;
const MIN_TABLE_SIZE_PX = 40;
const MIN_ROOM_LABEL_SIZE_PX = 18;
const DINING_SHAPES = new Set(["rectangle", "square", "circle"]);

const toNormPoint = (point, size) => ({
  x: point.x / size.width,
  y: point.y / size.height,
});

const toPxPoint = (point, size) => ({
  x: point.x * size.width,
  y: point.y * size.height,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cloneItems = (items) => items.map((item) => ({ ...item }));
const toSeatingShape = (shape) => (shape === "circle" ? "round" : "rect");
const isDiningShape = (shape) => DINING_SHAPES.has(shape);
const isBedShape = (shape) => shape === "bed";
const isRoomLabelShape = (shape) => shape === "room-label";
const getMinSizePxForShape = (shape) =>
  isRoomLabelShape(shape) ? MIN_ROOM_LABEL_SIZE_PX : MIN_TABLE_SIZE_PX;
const getSeatPositions = ({ x, y, width, height, shape, seats }) => {
  const safeSeats = Math.max(1, seats || 4);
  const points = [];

  if (shape === "circle") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2 + 22;
    for (let i = 0; i < safeSeats; i += 1) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / safeSeats;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    return points;
  }

  const topCount = Math.ceil(safeSeats / 2);
  const bottomCount = safeSeats - topCount;
  for (let i = 0; i < topCount; i += 1) {
    const px = x + ((i + 1) * width) / (topCount + 1);
    points.push({ x: px, y: y - 18 });
  }
  for (let i = 0; i < bottomCount; i += 1) {
    const px = x + ((i + 1) * width) / (bottomCount + 1);
    points.push({ x: px, y: y + height + 18 });
  }
  return points;
};

export default function FloorEditor() {
  const containerRef = useRef(null);
  const transformerRef = useRef(null);
  const tableRefs = useRef({});
  const dragBatchRef = useRef(null);
  const importInputRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const [tables, setTables] = useState([]);
  const [walls, setWalls] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [copiedTables, setCopiedTables] = useState([]);
  const [selectionRect, setSelectionRect] = useState(null);
  const [importError, setImportError] = useState("");
  const [mode, setMode] = useState("select");
  const [draftWall, setDraftWall] = useState(null);
  const selectedTables = tables.filter((t) => selectedIds.includes(t.id));
  const singleSelectedTable = selectedTables.length === 1 ? selectedTables[0] : null;
  const [labelInput, setLabelInput] = useState("");
  const canUngroup = selectedTables.some((t) => t.groupId);
  const useMergedWallRender = mode !== "draw-wall";

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    if (selectedIds.length === 0 || mode === "draw-wall") {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedIds
      .map((id) => tableRefs.current[id])
      .filter(Boolean);
    if (selectedNodes.length === 0) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, mode, tables]);

  useEffect(() => {
    if (!singleSelectedTable) {
      setLabelInput("");
      return;
    }
    if (isBedShape(singleSelectedTable.shape)) {
      setLabelInput(String(singleSelectedTable.bedNumber ?? ""));
      return;
    }
    if (isRoomLabelShape(singleSelectedTable.shape)) {
      setLabelInput(String(singleSelectedTable.roomLabel ?? ""));
      return;
    }
    setLabelInput(String(singleSelectedTable.customLabel ?? ""));
  }, [singleSelectedTable]);

  const addTable = (shape = "rectangle") => {
    const baseByShape = {
      rectangle: { width: 0.18, height: 0.12 },
      square: { width: 0.12, height: 0.12 },
      circle: { width: 0.12, height: 0.12 },
      bed: { width: 0.22, height: 0.12 },
      stairs: { width: 0.18, height: 0.16 },
      "room-label": { width: 0.1, height: 0.05 },
    };
    const base = baseByShape[shape] || baseByShape.rectangle;
    const nextBedNumber =
      Math.max(
        0,
        ...tables
          .filter((item) => isBedShape(item.shape))
          .map((item) => Number(item.bedNumber) || 0)
      ) + 1;
    const nextRoomNumber =
      Math.max(
        0,
        ...tables
          .filter((item) => isRoomLabelShape(item.shape))
          .map((item) => {
            const match = String(item.roomLabel || "").match(/\d+/);
            return match ? Number(match[0]) : 0;
          })
      ) + 1;

    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) => [
      ...prev,
      {
        id: uuid(),
        shape,
        x: 0.4,
        y: 0.4,
        width: base.width,
        height: base.height,
        rotation: 0,
        groupId: null,
        seats: isDiningShape(shape) ? 4 : 0,
        bedNumber: isBedShape(shape) ? String(nextBedNumber) : "",
        bedStatus: isBedShape(shape) ? "Vacant" : "",
        roomLabel: isRoomLabelShape(shape) ? `Room ${nextRoomNumber}` : "",
        customLabel: "",
      },
    ]);
  };

  const expandSelectionWithGroups = (ids, sourceTables = tables) => {
    const selectedSet = new Set(ids);
    const selectedGroupIds = new Set(
      sourceTables
        .filter((item) => selectedSet.has(item.id) && item.groupId)
        .map((item) => item.groupId)
    );
    if (selectedGroupIds.size === 0) return Array.from(selectedSet);
    sourceTables.forEach((item) => {
      if (item.groupId && selectedGroupIds.has(item.groupId)) selectedSet.add(item.id);
    });
    return Array.from(selectedSet);
  };

  const getTableBoundsPx = (table) => ({
    x1: table.x * size.width,
    y1: table.y * size.height,
    x2: (table.x + table.width) * size.width,
    y2: (table.y + table.height) * size.height,
  });

  const boxesIntersect = (a, b) =>
    !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);

  const normalizeSelectionRect = (rect) => ({
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  });

  const convertSeatingTableToEditorTable = (table) => {
    const shape = table.shape === "round" ? "circle" : "rectangle";
    const width =
      table.shape === "round" ? (table?.size?.r || 0.06) * 2 : table?.size?.w || 0.18;
    const height =
      table.shape === "round" ? (table?.size?.r || 0.06) * 2 : table?.size?.h || 0.12;

    return {
      id: table.id || uuid(),
      shape,
      x: table?.pos?.x || 0.4,
      y: table?.pos?.y || 0.4,
      width,
      height,
      rotation: table.rotation || 0,
      groupId: null,
      seats: table.seats ?? 4,
    };
  };

  const normalizeImportedLayout = (raw) => {
    const editorTables = Array.isArray(raw?.editor?.tables) ? raw.editor.tables : [];
    const seatingTables = Array.isArray(raw?.tables) ? raw.tables : [];
    const tablesToUse =
      editorTables.length > 0
        ? editorTables
        : seatingTables.map(convertSeatingTableToEditorTable);

    const editorWalls = Array.isArray(raw?.editor?.walls) ? raw.editor.walls : [];
    const wallsToUse = editorWalls.length > 0 ? editorWalls : Array.isArray(raw?.walls) ? raw.walls : [];

    const sanitizedTables = tablesToUse.map((table) => ({
      id: table.id || uuid(),
      shape: table.shape || "rectangle",
      x: Number(table.x ?? 0.4),
      y: Number(table.y ?? 0.4),
      width: Number(table.width ?? 0.18),
      height: Number(table.height ?? 0.12),
      rotation: Number(table.rotation ?? 0),
      groupId: table.groupId || null,
      seats: Number(table.seats ?? (isDiningShape(table.shape || "rectangle") ? 4 : 0)),
      bedNumber: table.bedNumber ? String(table.bedNumber) : "",
      bedStatus: isBedShape(table.shape) ? getCanonicalBedStatus(table.bedStatus) : "",
      roomLabel: table.roomLabel ? String(table.roomLabel) : "",
      customLabel: table.customLabel ? String(table.customLabel) : "",
    }));

    const sanitizedWalls = wallsToUse
      .filter((wall) => wall?.start && wall?.end)
      .map((wall) => ({
        id: wall.id || uuid(),
        start: {
          x: Number(wall.start.x ?? 0),
          y: Number(wall.start.y ?? 0),
        },
        end: {
          x: Number(wall.end.x ?? 0),
          y: Number(wall.end.y ?? 0),
        },
      }));

    return { tables: sanitizedTables, walls: sanitizedWalls };
  };

  const getWallEndpoints = () => {
    const points = [];
    walls.forEach((wall) => {
      points.push(toPxPoint(wall.start, size));
      points.push(toPxPoint(wall.end, size));
    });
    return points;
  };

  const getProjectionOnSegment = (point, segmentStart, segmentEnd) => {
    const vx = segmentEnd.x - segmentStart.x;
    const vy = segmentEnd.y - segmentStart.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return segmentStart;

    const t =
      ((point.x - segmentStart.x) * vx + (point.y - segmentStart.y) * vy) / lenSq;
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      x: segmentStart.x + vx * clampedT,
      y: segmentStart.y + vy * clampedT,
    };
  };

  const getSnapCandidates = (point) => {
    const candidates = getWallEndpoints();
    walls.forEach((wall) => {
      const start = toPxPoint(wall.start, size);
      const end = toPxPoint(wall.end, size);
      candidates.push(getProjectionOnSegment(point, start, end));
    });
    return candidates;
  };

  const snapPoint = (point, axis = null, axisStart = null) => {
    let candidates = getSnapCandidates(point);

    if (axis && axisStart) {
      candidates = candidates.filter((c) =>
        axis === "x"
          ? Math.abs(c.y - axisStart.y) <= SNAP_PX
          : Math.abs(c.x - axisStart.x) <= SNAP_PX
      );
    }

    let best = point;
    let bestDistance = SNAP_PX + 1;
    candidates.forEach((candidate) => {
      const d = distance(candidate, point);
      if (d <= SNAP_PX && d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    });

    return best;
  };

  const lockPointToAxis = (start, point, axis) => {
    if (axis === "x") return { x: point.x, y: start.y };
    if (axis === "y") return { x: start.x, y: point.y };
    return point;
  };

  const pickAxis = (start, point) => {
    const dx = Math.abs(point.x - start.x);
    const dy = Math.abs(point.y - start.y);
    if (Math.max(dx, dy) < AXIS_LOCK_THRESHOLD) return null;
    return dx >= dy ? "x" : "y";
  };

  const beginWall = (point) => {
    const start = snapPoint(point);
    setDraftWall({ start, end: start, axis: null });
  };

  const resolveDraftWall = (prev, point) => {
    const axis = prev.axis || pickAxis(prev.start, point);
    const axisLockedPoint = lockPointToAxis(prev.start, point, axis);
    const snappedEnd = snapPoint(axisLockedPoint, axis, prev.start);
    const end = lockPointToAxis(prev.start, snappedEnd, axis);
    return { ...prev, axis, end };
  };

  const updateWallDraft = (point) => {
    setDraftWall((prev) => {
      if (!prev) return null;
      return resolveDraftWall(prev, point);
    });
  };

  const commitWall = (point) => {
    setDraftWall((prev) => {
      if (!prev) return null;
      const resolved = point ? resolveDraftWall(prev, point) : prev;

      const end = resolved.end;
      if (distance(resolved.start, end) < MIN_WALL_LENGTH) return null;

      setHistory((hist) => [
        ...hist,
        { tables: cloneItems(tables), walls: cloneItems(walls) },
      ]);

      setWalls((current) => [
        ...current,
        {
          id: uuid(),
          start: toNormPoint(resolved.start, size),
          end: toNormPoint(end, size),
        },
      ]);
      return null;
    });
  };

  const handleStageMouseDown = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (mode === "draw-wall") {
      beginWall(pos);
      return;
    }

    if (e.target === stage) {
      const nativeEvt = e.evt || {};
      const additive = nativeEvt.shiftKey || nativeEvt.ctrlKey || nativeEvt.metaKey;
      setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, additive });
    }
  };

  const handleStageMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (draftWall) {
      updateWallDraft(pos);
      return;
    }

    if (!selectionRect) return;
    setSelectionRect((prev) => (prev ? { ...prev, x2: pos.x, y2: pos.y } : null));
  };

  const handleStageMouseUp = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (draftWall) {
      commitWall(pos);
      return;
    }

    if (!selectionRect) return;

    const rect = normalizeSelectionRect({ ...selectionRect, x2: pos.x, y2: pos.y });
    const rectW = rect.x2 - rect.x1;
    const rectH = rect.y2 - rect.y1;
    const selectedByBox = tables
      .filter((table) => boxesIntersect(rect, getTableBoundsPx(table)))
      .map((table) => table.id);
    const expanded = expandSelectionWithGroups(selectedByBox);

    setSelectedIds((prev) => {
      if (rectW < 4 && rectH < 4) {
        return selectionRect.additive ? prev : [];
      }
      if (selectionRect.additive) {
        return Array.from(new Set([...prev, ...expanded]));
      }
      return expanded;
    });
    setSelectionRect(null);
  };

  const onTableDragStart = (id) => {
    const current = tables.find((item) => item.id === id);
    if (!current) return;

    let movingIds = [id];
    if (current.groupId) {
      movingIds = tables
        .filter((item) => item.groupId === current.groupId)
        .map((item) => item.id);
    } else if (selectedIds.length > 1 && selectedIds.includes(id)) {
      movingIds = [...selectedIds];
    }

    const origins = {};
    movingIds.forEach((movingId) => {
      const t = tables.find((item) => item.id === movingId);
      if (!t) return;
      origins[movingId] = { x: t.x * size.width, y: t.y * size.height };
    });

    dragBatchRef.current = { movingIds, origins };
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
  };

  const onTableDragMove = (id, e) => {
    const batch = dragBatchRef.current;
    if (!batch || !batch.movingIds.includes(id)) return;
    if (batch.movingIds.length <= 1) return;

    const draggedNode = e.target;
    const start = batch.origins[id];
    if (!start) return;
    const dx = draggedNode.x() - start.x;
    const dy = draggedNode.y() - start.y;

    batch.movingIds.forEach((movingId) => {
      if (movingId === id) return;
      const node = tableRefs.current[movingId];
      const origin = batch.origins[movingId];
      if (!node || !origin) return;
      node.position({ x: origin.x + dx, y: origin.y + dy });
    });

    draggedNode.getLayer()?.batchDraw();
  };

  const onTableDragEnd = (id, e) => {
    const batch = dragBatchRef.current;
    const movingIds =
      batch && batch.movingIds.includes(id) ? batch.movingIds : [id];
    const movingSet = new Set(movingIds);

    setTables((prev) =>
      prev.map((t) => {
        if (!movingSet.has(t.id)) return t;
        const node = tableRefs.current[t.id];
        if (!node) return t;
        const widthPx = t.width * size.width;
        const heightPx = t.height * size.height;
        const nextX = Math.max(0, Math.min(node.x(), size.width - widthPx));
        const nextY = Math.max(0, Math.min(node.y(), size.height - heightPx));
        node.position({ x: nextX, y: nextY });
        return {
          ...t,
          x: nextX / size.width,
          y: nextY / size.height,
        };
      })
    );

    dragBatchRef.current = null;
  };

  const onTableTransformStart = () => {
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
  };

  const onTableTransformEnd = (id, e, currentTable) => {
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      const selectedSet = new Set(selectedIds);
      const nextById = new Map();

      tables.forEach((t) => {
        if (!selectedSet.has(t.id)) return;
        const node = tableRefs.current[t.id];
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        const currentWidthPx = t.width * size.width;
        const currentHeightPx = t.height * size.height;
        const minSizePx = getMinSizePxForShape(t.shape);
        let widthPx = Math.max(minSizePx, currentWidthPx * scaleX);
        let heightPx = Math.max(minSizePx, currentHeightPx * scaleY);
        if (t.shape === "square" || t.shape === "circle") {
          const side = Math.max(widthPx, heightPx);
          widthPx = side;
          heightPx = side;
        }

        node.scaleX(1);
        node.scaleY(1);

        const nextX = Math.max(0, Math.min(node.x(), size.width - widthPx));
        const nextY = Math.max(0, Math.min(node.y(), size.height - heightPx));
        node.position({ x: nextX, y: nextY });

        nextById.set(t.id, {
          x: nextX / size.width,
          y: nextY / size.height,
          width: widthPx / size.width,
          height: heightPx / size.height,
          rotation: node.rotation(),
        });
      });

      setTables((prev) =>
        prev.map((t) =>
          nextById.has(t.id)
            ? {
                ...t,
                ...nextById.get(t.id),
              }
            : t
        )
      );
      return;
    }

    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const currentWidthPx = currentTable.width * size.width;
    const currentHeightPx = currentTable.height * size.height;
    const minSizePx = getMinSizePxForShape(currentTable.shape);
    let widthPx = Math.max(minSizePx, currentWidthPx * scaleX);
    let heightPx = Math.max(minSizePx, currentHeightPx * scaleY);
    if (currentTable.shape === "square" || currentTable.shape === "circle") {
      const side = Math.max(widthPx, heightPx);
      widthPx = side;
      heightPx = side;
    }

    node.scaleX(1);
    node.scaleY(1);

    const nextX = Math.max(0, Math.min(node.x(), size.width - widthPx));
    const nextY = Math.max(0, Math.min(node.y(), size.height - heightPx));

    setTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              x: nextX / size.width,
              y: nextY / size.height,
              width: widthPx / size.width,
              height: heightPx / size.height,
              rotation: node.rotation(),
            }
          : t
      )
    );
  };

  const undoLast = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setTables(snapshot.tables);
      setWalls(snapshot.walls);
      setDraftWall(null);
      setSelectedIds([]);
      return prev.slice(0, -1);
    });
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) => prev.filter((item) => !selectedSet.has(item.id)));
    setSelectedIds([]);
  };

  const copySelected = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const current = tables
      .filter((item) => selectedSet.has(item.id))
      .map((item) => ({ ...item }));
    if (current.length === 0) return;
    setCopiedTables(current);
  };

  const pasteCopied = () => {
    if (copiedTables.length === 0) return;

    const offsetPx = 24;
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    const groupIdMap = new Map();

    const nextItems = copiedTables.map((item) => {
      const sourceX = item.x * size.width;
      const sourceY = item.y * size.height;
      const widthPx = item.width * size.width;
      const heightPx = item.height * size.height;
      const nextXPx = Math.max(0, Math.min(sourceX + offsetPx, size.width - widthPx));
      const nextYPx = Math.max(0, Math.min(sourceY + offsetPx, size.height - heightPx));
      let nextGroupId = item.groupId || null;
      if (item.groupId) {
        if (!groupIdMap.has(item.groupId)) groupIdMap.set(item.groupId, uuid());
        nextGroupId = groupIdMap.get(item.groupId);
      }

      return {
        ...item,
        id: uuid(),
        x: nextXPx / size.width,
        y: nextYPx / size.height,
        groupId: nextGroupId,
      };
    });

    setTables((prev) => [...prev, ...nextItems]);
    setSelectedIds(nextItems.map((item) => item.id));
    setCopiedTables(nextItems.map((item) => ({ ...item })));
  };

  const groupSelected = () => {
    if (selectedIds.length < 2) return;
    const groupId = uuid();
    const selectedSet = new Set(selectedIds);
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) =>
      prev.map((item) =>
        selectedSet.has(item.id)
          ? {
              ...item,
              groupId,
            }
          : item
      )
    );
  };

  const ungroupSelected = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const targetGroupIds = new Set(
      tables
        .filter((item) => selectedSet.has(item.id) && item.groupId)
        .map((item) => item.groupId)
    );
    if (targetGroupIds.size === 0) return;
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) =>
      prev.map((item) =>
        item.groupId && targetGroupIds.has(item.groupId)
          ? {
              ...item,
              groupId: null,
            }
          : item
      )
    );
  };

  const handleObjectSelect = (id, e) => {
    if (mode === "draw-wall") return;
    const nativeEvt = e?.evt || {};
    const isMultiSelect = nativeEvt.shiftKey || nativeEvt.ctrlKey || nativeEvt.metaKey;
    const relatedIds = expandSelectionWithGroups([id]);
    if (!isMultiSelect) {
      setSelectedIds(relatedIds);
      return;
    }

    setSelectedIds((prev) => {
      const prevSet = new Set(prev);
      const allAlreadySelected = relatedIds.every((relatedId) => prevSet.has(relatedId));
      if (allAlreadySelected) {
        relatedIds.forEach((relatedId) => prevSet.delete(relatedId));
      } else {
        relatedIds.forEach((relatedId) => prevSet.add(relatedId));
      }
      return Array.from(prevSet);
    });
  };

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && key === "z") {
        e.preventDefault();
        undoLast();
        return;
      }

      if (isMod && key === "c") {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelected();
        return;
      }

      if (isMod && key === "g" && !e.shiftKey) {
        e.preventDefault();
        groupSelected();
        return;
      }

      if (isMod && key === "g" && e.shiftKey) {
        e.preventDefault();
        ungroupSelected();
        return;
      }

      if (isMod && key === "v") {
        e.preventDefault();
        pasteCopied();
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, copiedTables, tables, walls, size]);

  const exportLayout = () => {
    const seatingTables = tables
      .filter((table) => isDiningShape(table.shape || "rectangle"))
      .map((table) => {
        const shape = table.shape || "rectangle";
        const seatingShape = toSeatingShape(shape);
        const width = table.width;
        const height = table.height;

        return {
          id: table.id,
          shape: seatingShape,
          pos: { x: table.x, y: table.y },
          size:
            seatingShape === "round"
              ? { r: Math.min(width, height) / 2 }
              : { w: width, h: height },
          rotation: table.rotation || 0,
          seats: table.seats ?? 4,
        };
      });

    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      canvasPx: { width: size.width, height: size.height },
      tables: seatingTables,
      walls,
      editor: {
        tables,
        walls,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "floor-layout.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const updateSelectedBedStatus = (nextStatus) => {
    if (!singleSelectedTable || !isBedShape(singleSelectedTable.shape)) return;
    const next = getCanonicalBedStatus(nextStatus);
    const current = getCanonicalBedStatus(singleSelectedTable.bedStatus);
    if (next === current) return;

    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) =>
      prev.map((t) => (t.id === singleSelectedTable.id ? { ...t, bedStatus: next } : t))
    );
  };

  const applySelectedLabel = () => {
    if (!singleSelectedTable) return;
    const nextValue = labelInput.trim();
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) =>
      prev.map((t) =>
        t.id === singleSelectedTable.id
          ? isBedShape(t.shape)
            ? { ...t, bedNumber: nextValue }
            : isRoomLabelShape(t.shape)
            ? { ...t, roomLabel: nextValue || "Room" }
            : { ...t, customLabel: nextValue }
          : t
      )
    );
  };

  const getDisplayLabel = (table, index) => {
    const shape = table.shape || "rectangle";
    if (isBedShape(shape)) return table.bedNumber || "Bed";
    if (isRoomLabelShape(shape)) return table.roomLabel || "Room";
    if (shape === "stairs") return table.customLabel || "Stairs";
    return table.customLabel || String(index + 1);
  };

  const handleQuickEditLabel = (table, index) => {
    const current = getDisplayLabel(table, index);
    const next = window.prompt("Edit label", current);
    if (next === null) return;
    setLabelInput(next);
    setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
    setTables((prev) =>
      prev.map((t) =>
        t.id === table.id
          ? isBedShape(t.shape)
            ? { ...t, bedNumber: next.trim() }
            : isRoomLabelShape(t.shape)
            ? { ...t, roomLabel: next.trim() || "Room" }
            : { ...t, customLabel: next.trim() }
          : t
      )
    );
  };

  const handleImportLayout = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const imported = normalizeImportedLayout(parsed);
        setHistory((prev) => [...prev, { tables: cloneItems(tables), walls: cloneItems(walls) }]);
        setTables(imported.tables);
        setWalls(imported.walls);
        setSelectedIds([]);
        setCopiedTables([]);
        setDraftWall(null);
        setMode("select");
        setImportError("");
      } catch {
        setImportError("Invalid JSON file. Please upload a valid layout export.");
      } finally {
        if (importInputRef.current) importInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Floor Layout Editor</h1>

      <div className="flex gap-3">
        <button
          onClick={() => addTable("rectangle")}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Rectangle Table
        </button>
        <button
          onClick={() => addTable("square")}
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Square Table
        </button>
        <button
          onClick={() => addTable("circle")}
          className="px-4 py-2 bg-cyan-600 text-white rounded"
        >
          Circular Table
        </button>
        <button
          onClick={() => addTable("bed")}
          className="px-4 py-2 bg-amber-600 text-white rounded"
        >
          Bed
        </button>
        <button
          onClick={() => addTable("stairs")}
          className="px-4 py-2 bg-teal-700 text-white rounded"
        >
          Stairs
        </button>
        <button
          onClick={() => addTable("room-label")}
          className="px-4 py-2 bg-yellow-700 text-white rounded"
        >
          Room Label
        </button>
        <button
          onClick={() => setMode((m) => (m === "draw-wall" ? "select" : "draw-wall"))}
          className={`px-4 py-2 rounded text-white ${
            mode === "draw-wall" ? "bg-emerald-700" : "bg-gray-700"
          }`}
        >
          {mode === "draw-wall" ? "Stop Wall Draw" : "Draw Walls"}
        </button>
        <button
          onClick={groupSelected}
          disabled={selectedIds.length < 2}
          className={`px-4 py-2 rounded text-white ${
            selectedIds.length < 2 ? "bg-gray-400 cursor-not-allowed" : "bg-violet-700"
          }`}
        >
          Group
        </button>
        <button
          onClick={ungroupSelected}
          disabled={!canUngroup}
          className={`px-4 py-2 rounded text-white ${
            !canUngroup ? "bg-gray-400 cursor-not-allowed" : "bg-violet-500"
          }`}
        >
          Ungroup
        </button>
        <button
          onClick={undoLast}
          disabled={history.length === 0}
          className={`px-4 py-2 rounded text-white ${
            history.length === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-rose-600"
          }`}
        >
          Undo
        </button>
        <button
          onClick={exportLayout}
          className="px-4 py-2 rounded text-white bg-slate-700"
        >
          Export JSON
        </button>
        <button
          onClick={handleImportClick}
          className="px-4 py-2 rounded text-white bg-slate-600"
        >
          Import JSON
        </button>
        <a href="/viewer" className="px-4 py-2 rounded text-white bg-slate-900">
          Open Viewer
        </a>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportLayout}
          className="hidden"
        />
      </div>
      {importError ? <div className="text-sm text-red-600">{importError}</div> : null}
      {singleSelectedTable ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {isBedShape(singleSelectedTable.shape)
              ? "Bed Number:"
              : isRoomLabelShape(singleSelectedTable.shape)
              ? "Room Name/Number:"
              : "Label:"}
          </span>
          <input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySelectedLabel();
              }
            }}
            className="px-2 py-1 border rounded w-56 text-black"
            placeholder={
              isBedShape(singleSelectedTable.shape)
                ? "e.g. B-101"
                : isRoomLabelShape(singleSelectedTable.shape)
                ? "e.g. Room 101"
                : "e.g. Table A"
            }
          />
          <button
            onClick={applySelectedLabel}
            className="px-3 py-1 rounded bg-slate-700 text-white"
          >
            Apply
          </button>
          {isBedShape(singleSelectedTable.shape) ? (
            <>
              <span className="font-medium ml-4">Status:</span>
              <select
                value={getCanonicalBedStatus(singleSelectedTable.bedStatus)}
                onChange={(e) => updateSelectedBedStatus(e.target.value)}
                className="px-2 py-1 border rounded text-black"
              >
                {BED_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="text-sm text-gray-600">
        Mode: {mode === "draw-wall" ? "Wall Draw" : "Select"} | Tip: walls auto-lock
        to X/Y direction and can cross or connect on existing walls. Use Shift/Ctrl/Cmd
        + click or drag on empty canvas to multi-select. Ctrl/Cmd+G groups,
        Ctrl/Cmd+Shift+G ungroups. Double-click any object label to edit quickly.
      </div>

      <div
        ref={containerRef}
        className="w-full h-[700px] border rounded-xl bg-[#e5e7eb]"
      >
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
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

            {useMergedWallRender ? (
              <Shape
                listening={false}
                perfectDrawEnabled={false}
                sceneFunc={(ctx, shape) => {
                  ctx.save();
                  ctx.lineCap = "round";
                  ctx.lineJoin = "round";

                  // Wall base stroke pass
                  ctx.strokeStyle = "#495462";
                  ctx.lineWidth = WALL_THICKNESS;
                  walls.forEach((wall) => {
                    const start = toPxPoint(wall.start, size);
                    const end = toPxPoint(wall.end, size);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                  });

                  // Highlight pass for style depth
                  ctx.strokeStyle = "#6f7d8d";
                  ctx.lineWidth = 4;
                  walls.forEach((wall) => {
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
            ) : (
              walls.map((wall) => {
                const start = toPxPoint(wall.start, size);
                const end = toPxPoint(wall.end, size);
                return (
                  <Group key={wall.id}>
                    <Line
                      points={[start.x, start.y, end.x, end.y]}
                      stroke="#495462"
                      strokeWidth={WALL_THICKNESS}
                      lineCap="round"
                    />
                    <Line
                      points={[start.x, start.y, end.x, end.y]}
                      stroke="#6f7d8d"
                      strokeWidth={4}
                      lineCap="round"
                      dash={[12, 10]}
                    />
                    <Circle x={start.x} y={start.y} radius={4} fill="#c77d2b" />
                    <Circle x={end.x} y={end.y} radius={4} fill="#c77d2b" />
                  </Group>
                );
              })
            )}

            {tables.map((table, index) => {
              const shape = table.shape || "rectangle";
              const x = table.x * size.width;
              const y = table.y * size.height;
              const width = table.width * size.width;
              const height = table.height * size.height;
              const seatPoints = isDiningShape(shape)
                ? getSeatPositions({
                    x,
                    y,
                    width,
                    height,
                    shape,
                    seats: table.seats ?? 4,
                  })
                : [];
              const isSelected = selectedIds.includes(table.id);
              const bedStyle = getBedVisualStyle({
                status: table.bedStatus,
                selected: isSelected,
              });

              return (
                <Group key={table.id}>
                  {seatPoints.map((seat, seatIndex) => (
                    <Rect
                      key={`${table.id}-seat-${seatIndex}`}
                      x={seat.x - 7}
                      y={seat.y - 7}
                      width={14}
                      height={14}
                      cornerRadius={2}
                      fill="#d9dde2"
                      listening={false}
                    />
                  ))}

                  <Group
                    x={x}
                    y={y}
                    rotation={table.rotation || 0}
                    ref={(node) => {
                      if (node) tableRefs.current[table.id] = node;
                      else delete tableRefs.current[table.id];
                    }}
                    draggable={mode !== "draw-wall"}
                    onClick={(e) => handleObjectSelect(table.id, e)}
                    onTap={(e) => handleObjectSelect(table.id, e)}
                    onDblClick={() => handleQuickEditLabel(table, index)}
                    onDblTap={() => handleQuickEditLabel(table, index)}
                    onDragStart={() => onTableDragStart(table.id)}
                    onDragMove={(e) => onTableDragMove(table.id, e)}
                    onDragEnd={(e) => onTableDragEnd(table.id, e)}
                    onTransformStart={onTableTransformStart}
                    onTransformEnd={(e) => onTableTransformEnd(table.id, e, table)}
                  >
                    {shape === "circle" ? (
                      <Circle
                        x={width / 2}
                        y={height / 2}
                        radius={Math.min(width, height) / 2}
                        fill={isSelected ? "#dbeafe" : "#d2d6dc"}
                        stroke="#c6ccd3"
                        strokeWidth={2}
                      />
                    ) : shape === "bed" ? (
                      <Group>
                        <Group scaleX={width / 200} scaleY={height / 240}>
                          <Rect
                            x={20}
                            y={20}
                            width={160}
                            height={200}
                            cornerRadius={12}
                            fill={bedStyle.outerFill}
                            stroke={bedStyle.outline}
                            strokeWidth={4}
                          />
                          <Rect
                            x={28}
                            y={28}
                            width={144}
                            height={184}
                            cornerRadius={10}
                            fill={bedStyle.innerFill}
                          />
                          <Rect
                            x={28}
                            y={98}
                            width={144}
                            height={6}
                            cornerRadius={3}
                            fill={bedStyle.stripeFill}
                          />
                          <Rect
                            x={48}
                            y={36}
                            width={104}
                            height={52}
                            cornerRadius={12}
                            fill={bedStyle.pillowFill}
                          />
                        </Group>
                      </Group>
                    ) : shape === "stairs" ? (
                      <Group>
                        <Rect
                          width={width}
                          height={height}
                          fill={isSelected ? "#ccfbf1" : "#dbe4ea"}
                          stroke="#90a3b4"
                          strokeWidth={2}
                          cornerRadius={8}
                        />
                        {[0.2, 0.4, 0.6, 0.8].map((step) => (
                          <Line
                            key={`${table.id}-step-${step}`}
                            points={[width * step, 6, width * step, Math.max(6, height - 6)]}
                            stroke="#7a8c9b"
                            strokeWidth={2}
                          />
                        ))}
                      </Group>
                    ) : shape === "room-label" ? (
                      <Group>
                        <Rect
                          width={width}
                          height={height}
                          fill={isSelected ? "#fef08a" : "#fffbeb"}
                          stroke="#a16207"
                          strokeWidth={2}
                          cornerRadius={10}
                        />
                        <Rect
                          x={4}
                          y={4}
                          width={Math.max(0, width - 8)}
                          height={Math.max(0, height - 8)}
                          fill={isSelected ? "#fde68a" : "#fef3c7"}
                          cornerRadius={8}
                        />
                      </Group>
                    ) : (
                      <Rect
                        width={width}
                        height={height}
                        fill={isSelected ? "#dbeafe" : "#d2d6dc"}
                        stroke="#c6ccd3"
                        strokeWidth={2}
                        cornerRadius={shape === "square" ? 8 : 28}
                      />
                    )}
                    <Text
                      text={getDisplayLabel(table, index)}
                      x={0}
                      y={shape === "bed" ? height * 0.225 : height / 2 - 8}
                      width={width}
                      align="center"
                      fontSize={
                        shape === "bed"
                          ? Math.max(9, Math.min(11, width * 0.09))
                          : shape === "room-label"
                          ? Math.max(10, Math.min(15, width * 0.12))
                          : shape === "stairs"
                          ? 13
                          : 18
                      }
                      fontStyle={shape === "room-label" ? "bold" : "normal"}
                      fill={shape === "bed" ? "#0f172a" : shape === "room-label" ? "#78350f" : "#111111"}
                    />
                  </Group>
                </Group>
              );
            })}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={
                singleSelectedTable?.shape === "square" || singleSelectedTable?.shape === "circle"
              }
              enabledAnchors={
                singleSelectedTable?.shape === "square" || singleSelectedTable?.shape === "circle"
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : [
                      "top-left",
                      "top-right",
                      "bottom-left",
                      "bottom-right",
                      "middle-left",
                      "middle-right",
                      "top-center",
                      "bottom-center",
                    ]
              }
              boundBoxFunc={(oldBox, newBox) => {
                const minSizePx = getMinSizePxForShape(singleSelectedTable?.shape);
                if (newBox.width < minSizePx || newBox.height < minSizePx) {
                  return oldBox;
                }
                return newBox;
              }}
            />

            {draftWall && (
              <Line
                points={[
                  draftWall.start.x,
                  draftWall.start.y,
                  draftWall.end.x,
                  draftWall.end.y,
                ]}
                stroke="#1d4ed8"
                strokeWidth={WALL_THICKNESS}
                opacity={0.6}
                lineCap="round"
              />
            )}

            {selectionRect && (
              <Rect
                x={Math.min(selectionRect.x1, selectionRect.x2)}
                y={Math.min(selectionRect.y1, selectionRect.y2)}
                width={Math.abs(selectionRect.x2 - selectionRect.x1)}
                height={Math.abs(selectionRect.y2 - selectionRect.y1)}
                fill="#3b82f633"
                stroke="#2563eb"
                strokeWidth={1}
                dash={[6, 4]}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
