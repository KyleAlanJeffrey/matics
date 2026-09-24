import { useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { busColor } from "@/model/types";
import { useProjectStore } from "@/store/project-store";
import { BUS_TAP_HANDLE, MIN_BUS_LENGTH, type BusNodeType } from "./to-flow";
import { useWireRegistry } from "./wire-registry";
import { useDiagramView } from "./view-state";
import { Tag } from "@/components/Badges";

const BAR_WIDTH = 16;
const DOT = "\u00b7";

export function BusNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<BusNodeType>) {
  const { bus, taps } = data;
  const color = busColor(bus);
  // While the end grip is dragged the bar follows the pointer; the store hears on release.
  const [draftHeight, setDraftHeight] = useState<number | null>(null);
  const height = draftHeight ?? data.height;
  const startLengthDrag = useLengthDrag(bus.id, positionAbsoluteY, setDraftHeight);
  // A tap being dragged along the bar; the wire follows because the handle moves.
  const [draftTap, setDraftTap] = useState<{ connectionId: string; y: number } | null>(null);
  const startTapDrag = useTapDrag(id, positionAbsoluteY, setDraftTap);
  // React Flow only re-measures handles when the node resizes. A tap added inside the
  // existing bar would otherwise have no measured handle and its wire would not draw.
  const updateNodeInternals = useUpdateNodeInternals();
  const tapKey = taps.map((tap) => `${tap.connectionId}@${tap.y}`).join("|");
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, tapKey, updateNodeInternals]);
  const tapY = (tap: { connectionId: string; y: number }) => (draftTap?.connectionId === tap.connectionId ? draftTap.y : tap.y);
  const { hidden, highlightBusId } = useDiagramView();
  const isHidden = hidden.includes(`bus:${bus.id}`);
  const dimmed = highlightBusId !== null && highlightBusId !== bus.id;

  // Wires crossing the bar hop over it, so the bar publishes itself like a wire.
  const barX = positionAbsoluteX + BAR_WIDTH / 2;
  useEffect(() => {
    useWireRegistry.getState().publish(id, [
      { x: barX, y: positionAbsoluteY },
      { x: barX, y: positionAbsoluteY + height },
    ]);
  }, [id, barX, positionAbsoluteY, height]);
  useEffect(() => () => useWireRegistry.getState().retract(id), [id]);

  const caption = [bus.variant || "Variant TBD", bus.rate].filter(Boolean).join(` ${DOT} `);

  return (
    <div className="relative" style={{ width: BAR_WIDTH, height, visibility: isHidden ? "hidden" : undefined, opacity: dimmed ? 0.2 : 1 }}>
      <div
        className="absolute top-0 w-1.5 rounded-full"
        style={{ left: (BAR_WIDTH - 6) / 2, height, background: color, boxShadow: selected || highlightBusId === bus.id ? `0 0 0 4px ${color}33` : undefined }}
      />
      <div className="absolute -top-[62px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap">
        {bus.tag && <Tag color={color} size="md">{bus.tag}</Tag>}
        <span className="rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>
          {bus.name}
        </span>
        <span className="rounded px-1.5 text-[9px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 12%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }}>
          {caption}
        </span>
      </div>
      {bus.repeatLabels &&
        bus.tag &&
        taps.map((tap) => (
          <div key={`tag-${tap.connectionId}`} className="pointer-events-none absolute" style={{ left: BAR_WIDTH + 4, top: tapY(tap) - 7 }}>
            <Tag color={color}>{bus.tag}</Tag>
          </div>
        ))}
      {/* Full-height invisible handle so new wires can be dropped anywhere on the bar. */}
      <Handle
        id={BUS_TAP_HANDLE}
        type="source"
        position={Position.Left}
        className="bus-tap-target"
        style={{ left: 0, top: 0, width: BAR_WIDTH, height, transform: "none", borderRadius: 4, background: "transparent", border: "none" }}
      />
      {taps.map((tap) => (
        <Handle
          key={tap.connectionId}
          id={tap.connectionId}
          type="source"
          position={tap.side === "left" ? Position.Left : Position.Right}
          isConnectable={false}
          className="nodrag nopan"
          title="Drag to move this tap along the bus"
          // React Flow gives non-connectable handles pointer-events: none; the tap must stay grabbable.
          style={{ left: BAR_WIDTH / 2, top: tapY(tap), width: 12, height: 12, background: color, border: "2px solid white", transform: "translate(-50%, -50%)", cursor: "ns-resize", zIndex: 5, pointerEvents: "all" }}
          onPointerDown={(event) => startTapDrag(event, tap.connectionId)}
          onClick={(event) => event.stopPropagation()}
        />
      ))}
      {/* Drawn last so it sits above the full-height tap handle. */}
      {selected && (
        <div
          className="nodrag nopan absolute left-1/2 z-10 h-3 w-5 -translate-x-1/2 rounded-full border-2 border-white shadow"
          style={{ top: height - 6, background: color, cursor: "ns-resize" }}
          title="Drag to change the bus length"
          onPointerDown={startLengthDrag}
        />
      )}
    </div>
  );
}

// Pointer drag on the end grip. Reports the live height, then stores the snapped length.
function useLengthDrag(busId: string, top: number, onDraft: (height: number | null) => void) {
  const { screenToFlowPosition } = useReactFlow();
  const latest = useRef<number | null>(null);
  return (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const flowY = screenToFlowPosition({ x: e.clientX, y: e.clientY }).y;
      const length = Math.max(MIN_BUS_LENGTH, Math.round((flowY - top) / 16) * 16);
      latest.current = length;
      onDraft(length);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (latest.current !== null) useProjectStore.getState().updateBus(busId, { length: latest.current });
      latest.current = null;
      onDraft(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

// Pointer drag on a tap. The handle follows the pointer (React Flow is told to re-measure
// so the wire follows too); on release the tap's flow y is stored on the connection.
function useTapDrag(nodeId: string, top: number, onDraft: (tap: { connectionId: string; y: number } | null) => void) {
  const { screenToFlowPosition } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const latest = useRef<number | null>(null);
  return (event: React.PointerEvent, connectionId: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const flowY = Math.round(screenToFlowPosition({ x: e.clientX, y: e.clientY }).y / 16) * 16;
      latest.current = flowY;
      onDraft({ connectionId, y: flowY - top });
      requestAnimationFrame(() => updateNodeInternals(nodeId));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (latest.current !== null) {
        const connection = useProjectStore.getState().project.connections[connectionId];
        useProjectStore.getState().updateConnection(connectionId, { route: { ...connection?.route, tapY: latest.current } });
      }
      latest.current = null;
      onDraft(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}
