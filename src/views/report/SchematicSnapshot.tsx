import { useEffect, useMemo, useRef } from "react";
import { ReactFlow, ReactFlowProvider, ConnectionMode, useReactFlow, useStore } from "@xyflow/react";
import type { Project } from "@/model/types";
import { projectToFlow, DEVICE_CARD_WIDTH } from "@/views/diagram/to-flow";
import { DeviceNode } from "@/views/diagram/DeviceNode";
import { BusNode } from "@/views/diagram/BusNode";
import { ZoneNode } from "@/views/diagram/ZoneNode";
import { ImageNode } from "@/views/diagram/ImageNode";
import { WireEdge } from "@/views/diagram/WireEdge";
import { FreeWireLayer } from "@/views/diagram/FreeWireLayer";
import { BundleLayer } from "@/views/diagram/BundleLayer";

const nodeTypes = { device: DeviceNode, bus: BusNode, zone: ZoneNode, image: ImageNode };
const edgeTypes = { wire: WireEdge };
// Only used to pick the figure's proportions; fitView does the real framing.
const CARD_HEIGHT_GUESS = 200;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 1080;
const noop = () => {};

// The schematic drawn read-only for the report, framed to fit its width. `onReady` fires
// once the nodes are measured and the wires have had a frame to draw.
export function SchematicSnapshot({ project, width, onReady }: { project: Project; width: number; onReady: () => void }) {
  const { nodes, edges } = useMemo(() => projectToFlow(project, null), [project]);

  const height = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const w = Number(node.style?.width ?? (node.type === "bus" ? node.data.bus.width : DEVICE_CARD_WIDTH));
      const h = Number(node.style?.height ?? (node.type === "bus" ? node.data.height : CARD_HEIGHT_GUESS));
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + w);
      maxY = Math.max(maxY, node.position.y + h);
    }
    if (!Number.isFinite(minX)) return MIN_HEIGHT;
    return Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, (width * (maxY - minY)) / Math.max(1, maxX - minX))));
  }, [nodes, width]);

  return (
    <div data-schematic className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50" style={{ width, height }}>
      {nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-slate-400">The schematic is empty.</div>
      ) : (
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.03 }}
            minZoom={0.02}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            className="report-schematic"
          >
            <FreeWireLayer selectedId={null} onSelect={noop} drawing={null} cursor={null} drawColor="" />
            <BundleLayer selectedId={null} onSelect={noop} />
            <FitWhenMeasured onReady={onReady} />
          </ReactFlow>
        </ReactFlowProvider>
      )}
      {nodes.length === 0 && <EmptyReady onReady={onReady} />}
    </div>
  );
}

// The fitView prop frames whatever is measured first, which can leave cards out. Framing
// again once every node has a size, then giving the wires a moment to draw, fixes that.
// (useNodesInitialized also waits for handle bounds, which zones never get.)
function FitWhenMeasured({ onReady }: { onReady: () => void }) {
  const initialized = useStore((s) => s.nodeLookup.size > 0 && Array.from(s.nodeLookup.values()).every((node) => !!node.measured.width && !!node.measured.height));
  const { fitView } = useReactFlow();
  const fired = useRef(false);
  useEffect(() => {
    if (!initialized || fired.current) return;
    fired.current = true;
    void fitView({ padding: 0.03 });
    // A timer rather than animation frames, which never fire while the window is hidden.
    setTimeout(onReady, 300);
  }, [initialized, fitView, onReady]);
  return null;
}

function EmptyReady({ onReady }: { onReady: () => void }) {
  const fired = useRef(false);
  if (!fired.current) {
    fired.current = true;
    queueMicrotask(onReady);
  }
  return null;
}
