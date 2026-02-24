"use client";

import { Circle, Group, Line, Rect, Text } from "react-konva";

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

export function BedNode({ x, y, width, height, rotation = 0 }) {
  return (
    <Group x={x} y={y} rotation={rotation}>
      <Rect
        width={width}
        height={height}
        fill="#f4e3c1"
        stroke="#b8925a"
        strokeWidth={2}
        cornerRadius={12}
      />
      <Rect
        x={6}
        y={6}
        width={Math.max(0, width - 12)}
        height={Math.max(0, height * 0.35)}
        fill="#e2d2b1"
        cornerRadius={8}
      />
      <Text
        text="Bed"
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

export function TableNode({ x, y, width, height, shape = "rectangle", rotation = 0, seats = 4, label }) {
  const seatPoints = getSeatPositions({
    x,
    y,
    width,
    height,
    shape,
    seats,
  });

  return (
    <Group>
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

export function FurnitureNode({ item, canvasSize, index }) {
  const shape = item.shape || "rectangle";
  const x = item.x * canvasSize.width;
  const y = item.y * canvasSize.height;
  const width = item.width * canvasSize.width;
  const height = item.height * canvasSize.height;

  if (shape === "bed") {
    return <BedNode x={x} y={y} width={width} height={height} rotation={item.rotation || 0} />;
  }

  if (shape === "stairs") {
    return <StairsNode x={x} y={y} width={width} height={height} rotation={item.rotation || 0} />;
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
    />
  );
}
