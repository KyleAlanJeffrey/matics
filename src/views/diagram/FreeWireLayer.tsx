import { useRef, useState } from "react";
import { ViewportPortal } from "@xyflow/react";
import { useProject, useProjectStore } from "@/store/project-store";
import { PORT_COLORS, type FreeWire, type Position as Point } from "@/model/types";
import { WireShape } from "./WireShape";
import { moveCorner, moveSegment, simplify } from "./wire-geometry";

const GRID = 16;

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  // Points placed so far with the wire tool, plus where the cursor is.
  drawing: Point[] | null;
  cursor: Point | null;
  drawColor: string;
}

// Wires that are not attached to ports. Rendered in flow coordinates through the
// viewport portal so they pan and zoom with everything else.
export function FreeWireLayer({ selectedId, onSelect, drawing, cursor, drawColor }: Props) {
  const project = useProject();
  const wires = Object.values(project.freeWires);
  const preview = drawing && drawing.length > 0 ? simplify(cursor ? [...drawing, cursor] : drawing) : null;

  return (
    <ViewportPortal>
      <svg className="absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1, pointerEvents: "none" }}>
        <g style={{ pointerEvents: "auto" }}>
          {wires.map((wire) => (
            <EditableFreeWire key={wire.id} wire={wire} selected={selectedId === wire.id} onSelect={() => onSelect(wire.id)} />
          ))}
        </g>
        {preview && preview.length > 1 && (
          <g className="pointer-events-none">
            <polyline points={preview.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={drawColor} strokeWidth={3.5} strokeDasharray="6 4" strokeLinecap="round" />
            {preview.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke={drawColor} strokeWidth={1.5} />
            ))}
          </g>
        )}
      </svg>
    </ViewportPortal>
  );
}

function EditableFreeWire({ wire, selected, onSelect }: { wire: FreeWire; selected: boolean; onSelect: () => void }) {
  const updateFreeWire = useProjectStore((s) => s.updateFreeWire);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const latest = useRef<Point[] | null>(null);
  const points = draft ?? wire.points;

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const stage = (next: Point[]) => {
    latest.current = next;
    setDraft(next);
  };

  return (
    <WireShape
      id={wire.id}
      points={points}
      color={PORT_COLORS[wire.kind]}
      lineCount={wire.lineCount}
      label={wire.label}
      selected={selected}
      draggableSegments={points.slice(0, -1).map((_, i) => i)}
      draggableCorners={points.map((_, i) => i)}
      onMoveSegment={(index, coordinate) => stage(moveSegment(points, index, snap(coordinate), false))}
      onMoveCorner={(index, point) => stage(moveCorner(points, index, { x: snap(point.x), y: snap(point.y) }))}
      onDragEnd={() => {
        if (latest.current) updateFreeWire(wire.id, { points: latest.current });
        latest.current = null;
        setDraft(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    />
  );
}
