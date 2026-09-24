import { useReactFlow, useStore, type ConnectionLineComponentProps } from "@xyflow/react";
import type { Position as Point } from "@/model/types";
import { useProject } from "@/store/project-store";
import { BUS_TAP_HANDLE, type DiagramNode } from "./to-flow";
import { resolveWireDrop, wireAt } from "./wire-hit";

const GRID = 16;
const COLOR = "#2563eb";

// The wire being dragged from a port. It ends exactly where releasing would connect: the
// tap point on a bus, the port under the pointer, or the join on a wire or trunk. When a
// release would do nothing it follows the pointer, dashed, with no end dot.
export function ConnectionPreview({ fromNode, fromX, fromY, toX, toY, toNode, toHandle, connectionStatus, pointer: panePointer }: ConnectionLineComponentProps<DiagramNode>) {
  const project = useProject();
  const { flowToScreenPosition } = useReactFlow();
  // React Flow hands `pointer` over in pane pixels while every other prop is in flow units.
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const pointer = { x: (panePointer.x - tx) / zoom, y: (panePointer.y - ty) / zoom };
  const target = previewTarget();

  function previewTarget(): Point | null {
    if (connectionStatus === "valid" && toNode && toHandle) {
      if (project.buses[toNode.id]) {
        if (toHandle.id !== BUS_TAP_HANDLE) return null;
        // The whole bar is one handle; the tap lands on its centre line at the release height.
        // React Flow resolves the target handle to its centre, so toX is already the bar's centre line.
        return { x: toX, y: Math.round(pointer.y / GRID) * GRID };
      }
      return toNode.id === fromNode.id ? null : { x: toX, y: toY };
    }
    const screen = flowToScreenPosition(pointer);
    const hit = wireAt(screen.x, screen.y);
    return (hit && resolveWireDrop(project, fromNode.id, hit, pointer)?.point) ?? null;
  }

  const end = target ?? pointer;
  const midX = (fromX + end.x) / 2;
  const path = `M ${fromX} ${fromY} H ${midX} V ${end.y} H ${end.x}`;
  return (
    <g className="pointer-events-none">
      <path d={path} fill="none" stroke={COLOR} strokeWidth={3} strokeDasharray={target ? undefined : "5 4"} opacity={target ? 1 : 0.6} />
      {target && <circle cx={target.x} cy={target.y} r={5} fill={COLOR} stroke="white" strokeWidth={1.5} />}
    </g>
  );
}
