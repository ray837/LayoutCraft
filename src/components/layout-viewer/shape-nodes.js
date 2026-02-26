"use client";

import { Circle, Group, Line, Rect, Text } from "react-konva";
import { getBedVisualStyle } from "./bed-status-style";

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

export function BedNode({
  x,
  y,
  width,
  height,
  rotation = 0,
  bedNumber,
  bedStatus,
  muted = false,
  isLinkedBedHighlight = false,
}) {
  const bedStyle = getBedVisualStyle({ status: bedStatus, selected: false });

  // Muted overrides everything; highlight overrides normal
  const outlineColor = muted
    ? "#cbd5e1"
    : isLinkedBedHighlight
    ? "#f59e0b"
    : bedStyle.outline;
  const stripeColor = muted
    ? "#cbd5e1"
    : isLinkedBedHighlight
    ? "#fbbf24"
    : bedStyle.stripeFill;
  const labelColor = muted ? "#94a3b8" : "#0f172a";

  return (
    <Group x={x} y={y} rotation={rotation}>
      <Group scaleX={width / 200} scaleY={height / 240}>
        <Rect
          x={20}
          y={20}
          width={160}
          height={200}
          cornerRadius={12}
          fill={isLinkedBedHighlight ? "#fef3c7" : bedStyle.outerFill}
          stroke={outlineColor}
          strokeWidth={isLinkedBedHighlight ? 6 : 4}
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
          fill={stripeColor}
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

      <Text
        text={bedNumber || "Bed"}
        x={0}
        y={height * 0.225}
        width={width}
        align="center"
        fontSize={Math.max(9, Math.min(11, width * 0.09))}
        fill={labelColor}
      />
    </Group>
  );
}

export function StairsNode({ x, y, width, height, rotation = 0 }) {
  return (
    <Group x={x} y={y} rotation={rotation}>
      <Rect
        width={width}
        height={height}
        fill="#dbe4ea"
        stroke="#90a3b4"
        strokeWidth={2}
        cornerRadius={8}
      />
      {[0.2, 0.4, 0.6, 0.8].map((step) => (
        <Line
          key={`step-${step}`}
          points={[width * step, 6, width * step, Math.max(6, height - 6)]}
          stroke="#7a8c9b"
          strokeWidth={2}
        />
      ))}
      <Text
        text="Stairs"
        x={0}
        y={height / 2 - 8}
        width={width}
        align="center"
        fontSize={13}
        fill="#111827"
      />
    </Group>
  );
}

export function RoomLabelNode({
  x,
  y,
  width,
  height,
  rotation = 0,
  roomLabel,
  isFocused = false,
  onClick,
}) {
  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      onClick={(e) => {
        e.cancelBubble = true;
        onClick?.(e);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onClick?.(e);
      }}
    >
      <Rect
        width={width}
        height={height}
        fill={isFocused ? "#fef08a" : "#fef3c7"}
        stroke={isFocused ? "#f59e0b" : "#b45309"}
        strokeWidth={isFocused ? 3 : 2}
        cornerRadius={8}
        shadowColor={isFocused ? "#f59e0b" : undefined}
        shadowBlur={isFocused ? 10 : 0}
        shadowOpacity={isFocused ? 0.6 : 0}
      />
      <Text
        text={roomLabel || "Room"}
        x={0}
        y={height / 2 - 8}
        width={width}
        align="center"
        fontSize={13}
        fontStyle={isFocused ? "bold" : "normal"}
        fill={isFocused ? "#92400e" : "#111827"}
      />
    </Group>
  );
}

export function TableNode({
  x,
  y,
  width,
  height,
  shape = "rectangle",
  rotation = 0,
  seats = 4,
  label,
  muted = false,
}) {
  const seatPoints = getSeatPositions({ x, y, width, height, shape, seats });

  return (
    <Group opacity={muted ? 0.25 : 1}>
      {seatPoints.map((seat, seatIndex) => (
        <Rect
          key={`seat-${seatIndex}`}
          x={seat.x - 7}
          y={seat.y - 7}
          width={14}
          height={14}
          cornerRadius={2}
          fill="#d9dde2"
          listening={false}
        />
      ))}

      <Group x={x} y={y} rotation={rotation}>
        {shape === "circle" ? (
          <Circle
            x={width / 2}
            y={height / 2}
            radius={Math.min(width, height) / 2}
            fill="#d2d6dc"
            stroke="#c6ccd3"
            strokeWidth={2}
          />
        ) : (
          <Rect
            width={width}
            height={height}
            fill="#d2d6dc"
            stroke="#c6ccd3"
            strokeWidth={2}
            cornerRadius={shape === "square" ? 8 : 28}
          />
        )}
        <Text
          text={label || "T"}
          x={0}
          y={height / 2 - 8}
          width={width}
          align="center"
          fontSize={16}
          fill="#111827"
        />
      </Group>
    </Group>
  );
}

export function FurnitureNode({
  item,
  canvasSize,
  index,
  onClick,
  isFocused = false,
  muted = false,
  isLinkedBedHighlight = false,
}) {
  const shape = item.shape || "rectangle";
  const x = item.x * canvasSize.width;
  const y = item.y * canvasSize.height;
  const width = item.width * canvasSize.width;
  const height = item.height * canvasSize.height;

  if (shape === "bed") {
    return (
      <BedNode
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={item.rotation || 0}
        bedNumber={item.bedNumber}
        bedStatus={item.bedStatus}
        muted={muted}
        isLinkedBedHighlight={isLinkedBedHighlight}
      />
    );
  }

  if (shape === "stairs") {
    return (
      <StairsNode
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={item.rotation || 0}
        muted={muted}
      />
    );
  }

  if (shape === "room-label") {
    return (
      <RoomLabelNode
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={item.rotation || 0}
        roomLabel={item.roomLabel}
        isFocused={isFocused}
        onClick={onClick}
      />
    );
  }

  return (
    <TableNode
      x={x}
      y={y}
      width={width}
      height={height}
      shape={shape}
      rotation={item.rotation || 0}
      seats={item.seats ?? 4}
      label={String(index + 1)}
      muted={muted}
    />
  );
}
