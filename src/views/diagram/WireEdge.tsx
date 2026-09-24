import { useMemo, useRef, useState } from "react";
import { type EdgeProps, type Position } from "@xyflow/react";
import { useProject, useProjectStore } from "@/store/project-store";
import { isBusRef, type Connection, type Position as Point, type WireBundle } from "@/model/types";
import type { WireEdgeType } from "./to-flow";
import { WireShape } from "./WireShape";
import { bundleExit, facing, memberEntry } from "./bundle-geometry";
import { connectionCorners, connectionPolyline, draggableSegments, moveSegment } from "./wire-geometry";
import { useDiagramView, wireVisibilityKey } from "./view-state";

const GRID = 16;

interface Ends {
  source: Point;
  sourcePosition: Position;
  target: Point;
  targetPosition: Position;
}

export function WireEdge(props: EdgeProps<WireEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const project = useProject();
  const connection = data?.connection;
  const color = data?.color ?? "#64748b";
  const bundle = connection?.bundleId ? project.bundles[connection.bundleId] : undefined;
  const { hidden, highlightBusId } = useDiagramView();

  const ends = useMemo<Ends>(
    () => ({ source: { x: sourceX, y: sourceY }, sourcePosition, target: { x: targetX, y: targetY }, targetPosition }),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition],
  );

  const key = connection ? wireVisibilityKey(project, connection) : null;
  if (key && hidden.includes(key)) return null;
  // Highlighting a bus fades every wire that is not on it.
  const dimmed = highlightBusId !== null && key !== `bus:${highlightBusId}` && !selected;

  if (connection && bundle && bundle.points.length > 1) {
    return (
      <g style={{ opacity: dimmed ? 0.15 : 1 }}>
        <BundledWire id={id} connection={connection} bundle={bundle} ends={ends} color={color} selected={Boolean(selected)} />
      </g>
    );
  }

  return (
    <g style={{ opacity: dimmed ? 0.15 : 1 }}>
      <RoutedWire
      id={id}
      ends={ends}
      corners={connection?.route?.points}
      centerOffset={connection?.route?.centerOffset ?? 0}
      color={color}
      lineCount={connection?.lineCount ?? 1}
      label={connection?.label}
      selected={Boolean(selected)}
      dotAtEnd={connection ? isBusRef(connection.to) : false}
        onCorners={(corners) => useProjectStore.getState().updateConnection(id, { route: { points: corners, centerOffset: 0 } })}
      />
    </g>
  );
}

// One orthogonal run between two ends whose corners the user can drag. Used for a plain
// wire and for each tail of a bundled one.
function RoutedWire({
  id,
  ends,
  corners,
  centerOffset = 0,
  color,
  lineCount,
  label,
  selected,
  dotAtStart,
  dotAtEnd,
  onCorners,
}: {
  id: string;
  ends: Ends;
  corners: Point[] | undefined;
  centerOffset?: number;
  color: string;
  lineCount: number;
  label?: string;
  selected: boolean;
  dotAtStart?: boolean;
  dotAtEnd?: boolean;
  onCorners: (corners: Point[]) => void;
}) {
  // While a handle is being dragged the polyline lives here; the store hears about it on release.
  const [draft, setDraft] = useState<Point[] | null>(null);
  const latest = useRef<Point[] | null>(null);
  const stored = useMemo(() => connectionPolyline(ends, corners, centerOffset), [ends, corners, centerOffset]);
  const points = draft ?? stored;

  return (
    <WireShape
      id={id}
      points={points}
      color={color}
      lineCount={lineCount}
      label={label}
      selected={selected}
      draggableSegments={draggableSegments(points)}
      onMoveSegment={(index, coordinate) => {
        const next = moveSegment(points, index, Math.round(coordinate / GRID) * GRID, true);
        latest.current = next;
        setDraft(next);
      }}
      onDragEnd={() => {
        if (latest.current) onCorners(connectionCorners(latest.current));
        latest.current = null;
        setDraft(null);
      }}
      dotAtStart={dotAtStart}
      dotAtEnd={dotAtEnd}
    />
  );
}

// A bundled wire is two tails: source port to the trunk's entry end, trunk's exit end to
// the target. The trunk itself is drawn once by BundleLayer.
function BundledWire({ id, connection, bundle, ends, color, selected }: { id: string; connection: Connection; bundle: WireBundle; ends: Ends; color: string; selected: boolean }) {
  const updateConnection = useProjectStore((s) => s.updateConnection);
  const project = useProject();
  const entry = memberEntry(project, bundle, connection.id);
  const exit = bundleExit(project, bundle);
  const entryEnds = useMemo<Ends>(
    () => ({ source: ends.source, sourcePosition: ends.sourcePosition, target: entry, targetPosition: facing(entry, ends.source) }),
    [ends.source, ends.sourcePosition, entry],
  );
  const exitEnds = useMemo<Ends>(
    () => ({ source: exit, sourcePosition: facing(exit, ends.target), target: ends.target, targetPosition: ends.targetPosition }),
    [exit, ends.target, ends.targetPosition],
  );

  return (
    <>
      <RoutedWire
        id={`${id}:in`}
        ends={entryEnds}
        corners={connection.route?.points}
        color={color}
        lineCount={connection.lineCount}
        selected={selected}
        dotAtEnd
        onCorners={(points) => updateConnection(id, { route: { ...connection.route, points, centerOffset: 0 } })}
      />
      <RoutedWire
        id={`${id}:out`}
        ends={exitEnds}
        corners={connection.route?.exitPoints}
        color={color}
        lineCount={connection.lineCount}
        selected={selected}
        dotAtStart
        dotAtEnd={isBusRef(connection.to)}
        onCorners={(exitPoints) => updateConnection(id, { route: { ...connection.route, exitPoints, centerOffset: 0 } })}
      />
    </>
  );
}
