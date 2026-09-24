import { useEffect, useMemo, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Position as Point } from "@/model/types";
import { useWireRegistry } from "./wire-registry";
import { hopsOver, labelAnchor, pointAlong, segmentAxis, segmentLength, wirePath, type Hop } from "./wire-geometry";

export interface WireShapeProps {
  id: string;
  points: Point[];
  color: string;
  lineCount: number;
  label?: string;
  selected: boolean;
  // Segments the user may drag sideways, and corners they may drag freely.
  draggableSegments?: number[];
  draggableCorners?: number[];
  onMoveSegment?: (index: number, coordinate: number) => void;
  onMoveCorner?: (index: number, point: Point) => void;
  onDragEnd?: (event?: PointerEvent) => void;
  onClick?: (event: React.MouseEvent) => void;
  // Draw junction dots at these polyline ends.
  dotAtStart?: boolean;
  dotAtEnd?: boolean;
  // Only the routing handles, for a polyline whose strokes are drawn elsewhere.
  handlesOnly?: boolean;
}

// Shared renderer for connection wires and free wires: the path with hops, the
// bundle slash and count, the label, and the routing handles.
export function WireShape(props: WireShapeProps) {
  const { id, points, color, lineCount, label, selected, draggableSegments = [], draggableCorners = [], onMoveSegment, onMoveCorner, onDragEnd, onClick, handlesOnly = false } = props;
  const { publish, retract } = useWireRegistry.getState();
  const others = useWireRegistry((s) => s.polylines);

  const key = points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
  useEffect(() => {
    if (!handlesOnly) publish(id, points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, handlesOnly]);
  useEffect(() => () => retract(id), [id, retract]);

  const hops = useMemo(() => {
    const out: Hop[] = [];
    for (const [otherId, polyline] of Object.entries(others)) {
      if (otherId === id) continue;
      out.push(...hopsOver(points, polyline));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, id, key]);

  const path = useMemo(() => wirePath(points, hops), [points, hops]);
  const anchor = labelAnchor(points, draggableSegments);
  const showBundle = lineCount > 1;
  const vertical = anchor.axis === "v";

  return (
    <g onClick={onClick} className="wire" data-wire-id={handlesOnly ? undefined : id}>
      {/* Wide invisible stroke so thin wires are easy to click. */}
      {!handlesOnly && <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" />}
      {!handlesOnly && <path d={path} fill="none" stroke={color} strokeWidth={selected ? 5 : 3.5} strokeLinecap="round" className="pointer-events-none wire-path" />}

      {!handlesOnly && props.dotAtStart && <circle cx={points[0].x} cy={points[0].y} r={5} fill={color} stroke="white" strokeWidth={1.5} className="pointer-events-none" />}
      {!handlesOnly && props.dotAtEnd && points.length > 1 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={color} stroke="white" strokeWidth={1.5} className="pointer-events-none" />
      )}

      {!handlesOnly && showBundle && (
        <g transform={`translate(${anchor.point.x} ${anchor.point.y})`} className="pointer-events-none">
          <line x1={-5} y1={6} x2={5} y2={-6} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <text x={vertical ? 10 : 0} y={vertical ? -4 : -10} textAnchor={vertical ? "start" : "middle"} fontSize={12} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
            {lineCount}
          </text>
        </g>
      )}

      {!handlesOnly && label && (
        <g transform={`translate(${anchor.point.x} ${anchor.point.y})`} className="pointer-events-none">
          <text
            x={vertical ? 10 : 0}
            y={vertical ? (showBundle ? 10 : 4) : showBundle ? 20 : 16}
            textAnchor={vertical ? "start" : "middle"}
            fontSize={10.5}
            fontWeight={600}
            fill={color}
            stroke="white"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {label}
          </text>
        </g>
      )}

      {selected &&
        onMoveSegment &&
        draggableSegments.map((index) => {
          const a = points[index];
          const b = points[index + 1];
          if (!a || !b) return null;
          const axis = segmentAxis(a, b);
          if (!axis) return null;
          const mid = pointAlong(a, b, segmentLength(a, b) / 2);
          const onMove = (flow: Point) => onMoveSegment(index, axis === "h" ? flow.y : flow.x);
          return (
            <g key={`seg-${index}`}>
              <DraggableSegment a={a} b={b} axis={axis} onMove={onMove} onEnd={onDragEnd} />
              <SegmentHandle point={mid} axis={axis} onMove={onMove} onEnd={onDragEnd} />
            </g>
          );
        })}

      {selected &&
        onMoveCorner &&
        draggableCorners.map((index) => {
          const point = points[index];
          if (!point) return null;
          return <CornerHandle key={`corner-${index}`} point={point} onMove={(flow) => onMoveCorner(index, flow)} onEnd={onDragEnd} />;
        })}
    </g>
  );
}

// Pointer drag that reports positions in flow coordinates. Listeners go on the window
// so the drag survives the pointer leaving the small handle.
function useFlowDrag(onMove: (point: Point) => void, onEnd?: (event: PointerEvent) => void) {
  const { screenToFlowPosition } = useReactFlow();
  const active = useRef(false);

  return (event: React.PointerEvent) => {
    // Only the primary button drags; the pane pans with the others.
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    active.current = true;
    const move = (e: PointerEvent) => {
      if (!active.current) return;
      onMove(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    };
    const up = (e: PointerEvent) => {
      active.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEnd?.(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

// The whole selected segment is a drag surface; the small handle in its middle just
// shows that it can be dragged and which way.
function DraggableSegment({ a, b, axis, onMove, onEnd }: { a: Point; b: Point; axis: "h" | "v"; onMove: (p: Point) => void; onEnd?: (event: PointerEvent) => void }) {
  const start = useFlowDrag(onMove, onEnd);
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke="rgba(37, 99, 235, 0.18)"
      strokeWidth={14}
      strokeLinecap="round"
      style={{ cursor: axis === "h" ? "ns-resize" : "ew-resize" }}
      onPointerDown={start}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <title>Drag to move this segment</title>
    </line>
  );
}

function SegmentHandle({ point, axis, onMove, onEnd }: { point: Point; axis: "h" | "v"; onMove: (p: Point) => void; onEnd?: (event: PointerEvent) => void }) {
  const start = useFlowDrag(onMove, onEnd);
  const w = axis === "h" ? 22 : 8;
  const h = axis === "h" ? 8 : 22;
  return (
    <rect
      x={point.x - w / 2}
      y={point.y - h / 2}
      width={w}
      height={h}
      rx={3}
      fill="white"
      stroke="#2563eb"
      strokeWidth={1.5}
      style={{ cursor: axis === "h" ? "ns-resize" : "ew-resize" }}
      onPointerDown={start}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <title>Drag to move this segment</title>
    </rect>
  );
}

function CornerHandle({ point, onMove, onEnd }: { point: Point; onMove: (p: Point) => void; onEnd?: (event: PointerEvent) => void }) {
  const start = useFlowDrag(onMove, onEnd);
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={6}
      fill="white"
      stroke="#2563eb"
      strokeWidth={1.5}
      style={{ cursor: "move" }}
      onPointerDown={start}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <title>Drag to move this corner</title>
    </circle>
  );
}
