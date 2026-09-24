import { useMemo, useRef, useState } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { useProject, useProjectStore } from "@/store/project-store";
import { PORT_COLORS, busColor, isBusRef, type Position as Point, type Project, type WireBundle } from "@/model/types";
import { portKindOf } from "@/model/derived";
import { WireShape } from "./WireShape";
import { moveCorner, moveSegment, polylineLength } from "./wire-geometry";
import { trunkRuns } from "./bundle-geometry";
import { useDiagramView, wireVisibilityKey } from "./view-state";
import { harnessIds, wireAt } from "./wire-hit";
import { useWireRegistry } from "./wire-registry";

const GRID = 16;

// Trunks of wire bundles. Members draw their own tails to the trunk (WireEdge); this
// layer draws each trunk once, split into runs whose line count grows at every join.
export function BundleLayer({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const project = useProject();
  const bundles = Object.values(project.bundles).filter((b) => b.points.length > 1);
  if (bundles.length === 0) return null;

  return (
    <ViewportPortal>
      <svg className="absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1, pointerEvents: "none" }}>
        <g style={{ pointerEvents: "auto" }}>
          {bundles.map((bundle) => (
            <EditableTrunk key={bundle.id} bundle={bundle} project={project} selected={selectedId === bundle.id} onSelect={() => onSelect(bundle.id)} />
          ))}
        </g>
      </svg>
    </ViewportPortal>
  );
}

// Like a wire: the bus color when the members run into a bus, else the source family.
export function bundleColor(project: Project, bundle: WireBundle) {
  const first = bundle.members.map((id) => project.connections[id]).find(Boolean);
  if (first && isBusRef(first.to) && project.buses[first.to.busId]) return busColor(project.buses[first.to.busId]);
  const kind = first ? portKindOf(project, first.from.deviceId, first.from.portId) : undefined;
  return PORT_COLORS[kind ?? "digital-out"];
}

function EditableTrunk({ bundle, project, selected, onSelect }: { bundle: WireBundle; project: Project; selected: boolean; onSelect: () => void }) {
  const { updateBundle, linkBundle, linkBundleToWire } = useProjectStore();
  const { screenToFlowPosition } = useReactFlow();
  const { hidden, highlightBusId } = useDiagramView();
  const [draft, setDraft] = useState<Point[] | null>(null);
  const latest = useRef<Point[] | null>(null);
  const draggedCorner = useRef<number | null>(null);
  const points = draft ?? bundle.points;
  const first = bundle.members.map((id) => project.connections[id]).find(Boolean);
  const key = first ? wireVisibilityKey(project, first) : undefined;
  const runs = useMemo(() => trunkRuns(project, { ...bundle, points }), [project, bundle, points]);
  if (key && hidden.includes(key)) return null;
  const dimmed = highlightBusId !== null && key !== `bus:${highlightBusId}` && !selected;
  const color = bundleColor(project, bundle);
  const labelRun = runs.reduce((best, run, i) => (polylineLength(run.points) > polylineLength(runs[best].points) ? i : best), 0);

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const stage = (next: Point[]) => {
    latest.current = next;
    setDraft(next);
  };

  // A trunk end let go over another wire or trunk runs into it there.
  const mergeAt = (event: PointerEvent) => {
    const index = draggedCorner.current;
    if (index === null || (index !== 0 && index !== points.length - 1)) return;
    const own = harnessIds(project, bundle);
    const hit = wireAt(event.clientX, event.clientY, (id) => own.has(id));
    if (!hit) return;
    const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (project.bundles[hit.id]) {
      linkBundle(bundle.id, hit.id, flow);
      return;
    }
    const host = project.connections[hit.id];
    if (!host || host.bundleId) return;
    const polyline = useWireRegistry.getState().polylines[hit.id];
    if (polyline) linkBundleToWire(bundle.id, hit.id, polyline, flow);
  };

  return (
    <g style={{ opacity: dimmed ? 0.15 : 1 }}>
      {runs.map((run, i) => (
        <WireShape
          key={`${bundle.id}:run${i}`}
          id={`${bundle.id}:run${i}`}
          points={run.points}
          color={color}
          lineCount={run.lineCount}
          label={i === labelRun ? bundle.label : undefined}
          selected={selected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          dotAtStart={i === 0 || run.junction}
          dotAtEnd={i === runs.length - 1}
        />
      ))}
      <WireShape
        id={bundle.id}
        points={points}
        color={color}
        lineCount={1}
        selected={selected}
        handlesOnly
        draggableSegments={points.slice(0, -1).map((_, i) => i)}
        draggableCorners={points.map((_, i) => i)}
        onMoveSegment={(index, coordinate) => {
          draggedCorner.current = null;
          stage(moveSegment(points, index, snap(coordinate), false));
        }}
        onMoveCorner={(index, point) => {
          draggedCorner.current = index;
          stage(moveCorner(points, index, { x: snap(point.x), y: snap(point.y) }));
        }}
        onDragEnd={(event) => {
          if (latest.current) updateBundle(bundle.id, { points: latest.current });
          if (event && latest.current) mergeAt(event);
          latest.current = null;
          draggedCorner.current = null;
          setDraft(null);
        }}
      />
    </g>
  );
}
