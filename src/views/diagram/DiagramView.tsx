import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
  SelectionMode,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection as FlowConnection,
  type EdgeMouseHandler,
  type OnConnectEnd,
  type NodeMouseHandler,
  type OnDelete,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import { ClipboardPaste, Copy, Hand, ImagePlus, Maximize, Minus, MousePointer2, Plus, Share2, Spline, SquareDashed } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { CATEGORY_LABELS, PORT_COLORS, PORT_KINDS, PORT_KIND_LABELS, type PortKind, type Position as Point } from "@/model/types";
import { useDropdown } from "@/components/Menu";
import { Legend } from "./Legend";
import { PASTE_OFFSET, collectSelection, readClipboard, writeClipboard } from "./clipboard";
import { DeviceNode } from "./DeviceNode";
import { BusNode } from "./BusNode";
import { ZoneNode } from "./ZoneNode";
import { WireEdge } from "./WireEdge";
import { FreeWireLayer } from "./FreeWireLayer";
import { BundleLayer } from "./BundleLayer";
import { snapOrthogonal } from "./wire-geometry";
import { Library, PRESET_DRAG_TYPE } from "./Library";
import { Inspector } from "./Inspector";
import { BUS_TAP_HANDLE, DEVICE_CARD_WIDTH, parsePortHandle, projectToFlow, type DiagramNode } from "./to-flow";
import { resolveWireDrop, wireAt } from "./wire-hit";
import { ConnectionPreview } from "./ConnectionPreview";
import { ImageNode, MIN_IMAGE_EDGE } from "./ImageNode";
import { SCHEMATIC_IMAGE_TYPES, loadSchematicImage } from "@/lib/image";
import { desktop, isDesktop } from "@/lib/desktop";

const nodeTypes = { device: DeviceNode, bus: BusNode, zone: ZoneNode, image: ImageNode };
const edgeTypes = { wire: WireEdge };
const GRID = 16;
// A dropped picture starts at most this big in flow pixels; drag its corners to change it.
const IMAGE_MAX_WIDTH = 480;
const IMAGE_MAX_HEIGHT = 360;

type Tool = "select" | "pan" | "wire";

export function DiagramView() {
  return (
    <ReactFlowProvider>
      <DiagramCanvas />
    </ReactFlowProvider>
  );
}

function DiagramCanvas() {
  const project = useProject();
  const {
    moveDevice,
    moveBus,
    moveZoneWithContents,
    addConnection,
    attachWireToWire,
    attachWireToBundle,
    addDevice,
    addBus,
    addZone,
    removeDevice,
    removeBus,
    removeZone,
    removeConnection,
    addFreeWire,
    removeFreeWire,
    pasteSelection,
    addImage,
    updateImage,
    removeImage,
  } = useProjectStore();
  const imageInput = useRef<HTMLInputElement>(null);
  const { selectedId, select } = useSelection();
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(true);
  // Wire tool: corners placed so far and the live cursor position, in flow coordinates.
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [drawKind, setDrawKind] = useState<PortKind>("digital-out");

  const derived = useMemo(() => projectToFlow(project, selectedId), [project, selectedId]);
  // Nodes are mirrored into local state so React Flow can move them live while dragging;
  // the store only hears about the final position on drag stop.
  const [nodes, setNodes] = useState<DiagramNode[]>(derived.nodes);
  // Fresh node objects have no measured size, and React Flow hides every edge until the
  // nodes are measured again. Carrying the sizes over keeps wires on screen across edits.
  useEffect(
    () =>
      setNodes((current) => {
        const measured = new Map(current.map((node) => [node.id, node.measured]));
        return derived.nodes.map((node) => (measured.has(node.id) ? { ...node, measured: measured.get(node.id) } : node));
      }),
    [derived.nodes],
  );
  const edges = derived.edges;

  // Everything React Flow has box- or shift-selected, plus the URL selection (which also
  // covers free wires and bundle trunks that are not React Flow nodes).
  const selectedIds = useMemo(() => {
    const ids = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (selectedId) ids.add(selectedId);
    return Array.from(ids);
  }, [nodes, selectedId]);

  const copySelection = useCallback(() => {
    const payload = collectSelection(project, selectedIds);
    if (payload) void writeClipboard(payload);
  }, [project, selectedIds]);

  const pasteFromClipboard = useCallback(async () => {
    const payload = await readClipboard();
    if (!payload) return;
    const created = pasteSelection(payload, PASTE_OFFSET);
    if (created[0]) select(created[0]);
  }, [pasteSelection, select]);

  const onNodesChange: OnNodesChange<DiagramNode> = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), current)),
    [],
  );

  // Zones carry their devices along while dragging.
  const onNodeDrag: OnNodeDrag<DiagramNode> = useCallback(
    (_event, node) => {
      if (node.type !== "zone") return;
      const zone = project.zones[node.id];
      if (!zone) return;
      const dx = node.position.x - zone.position.x;
      const dy = node.position.y - zone.position.y;
      setNodes((current) =>
        current.map((n) => {
          if (n.type !== "device" || n.data.device.zoneId !== node.id) return n;
          const base = project.devices[n.id].position;
          return { ...n, position: { x: base.x + dx, y: base.y + dy } };
        }),
      );
    },
    [project.zones, project.devices],
  );

  const finishDrawing = useCallback(
    (points: Point[] | null) => {
      if (points && points.length > 1) select(addFreeWire({ kind: drawKind, points, lineCount: 1 }));
      setDrawing(null);
      setCursor(null);
    },
    [addFreeWire, drawKind, select],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "c") {
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteFromClipboard();
        return;
      }
      if (mod) return;
      if (event.key === "v") setTool("select");
      if (event.key === "h") setTool("pan");
      if (event.key === "w") setTool("wire");
      if (event.key === "Escape") {
        setDrawing(null);
        setCursor(null);
        if (tool === "wire") setTool("select");
      }
      if (event.key === "Enter" && drawing) finishDrawing(drawing);
      // Free wires and bundle trunks are not React Flow elements, so delete them here.
      if ((event.key === "Backspace" || event.key === "Delete") && selectedId && project.freeWires[selectedId]) {
        removeFreeWire(selectedId);
        select(null);
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedId && project.bundles[selectedId]) {
        useProjectStore.getState().dissolveBundle(selectedId);
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, drawing, finishDrawing, selectedId, project.freeWires, project.bundles, removeFreeWire, select, copySelection, pasteFromClipboard]);

  const toFlow = useCallback(
    (event: React.MouseEvent) => {
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      return snap ? snapPosition(point) : point;
    },
    [screenToFlowPosition, snap],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (tool !== "wire") {
        select(null);
        return;
      }
      const point = toFlow(event);
      setDrawing((current) => (current && current.length > 0 ? [...current, snapOrthogonal(current[current.length - 1], point)] : [point]));
    },
    [tool, toFlow, select],
  );

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (tool !== "wire" || !drawing) return;
      const point = toFlow(event);
      setCursor(snapOrthogonal(drawing[drawing.length - 1], point));
    },
    [tool, drawing, toFlow],
  );

  const onDoubleClick = useCallback(() => {
    // The two clicks of a double click already appended a duplicate corner; drop it and finish.
    if (tool === "wire" && drawing) finishDrawing(drawing.slice(0, -1));
  }, [tool, drawing, finishDrawing]);

  const onNodeDragStop: OnNodeDrag<DiagramNode> = useCallback(
    (_event, node, dragged) => {
      const all = dragged.length > 0 ? dragged : [node];
      // Zones first: moving a zone shifts its devices, then the absolute device moves win.
      for (const n of all) if (n.type === "zone") moveZoneWithContents(n.id, n.position);
      for (const n of all) {
        if (n.type === "device") moveDevice(n.id, n.position);
        if (n.type === "bus") moveBus(n.id, n.position);
        if (n.type === "image") updateImage(n.id, { position: n.position });
      }
    },
    [moveDevice, moveBus, moveZoneWithContents, updateImage],
  );

  const onConnect = useCallback(
    (params: FlowConnection) => {
      if (!params.source || !params.sourceHandle || !params.target) return;
      const fromDevice = project.devices[params.source];
      if (!fromDevice) return;
      // Bus drops are handled in onConnectEnd, which knows where the pointer let go.
      if (project.buses[params.target]) return;
      const from = { deviceId: params.source, portId: parsePortHandle(params.sourceHandle).portId };
      if (project.devices[params.target] && params.targetHandle && params.target !== params.source) {
        const toPortId = parsePortHandle(params.targetHandle).portId;
        addConnection({ from, to: { deviceId: params.target, portId: toPortId }, lineCount: fromDevice.qty });
      }
    },
    [project, addConnection],
  );

  // A wire dropped on a bus taps the bar where it was released. Dropped on another wire
  // or on a trunk, it joins that wire's bundle at the drop point and shares its target.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (!state.fromNode || !state.fromHandle?.id || !project.devices[state.fromNode.id]) return;
      const from = { deviceId: state.fromNode.id, portId: parsePortHandle(state.fromHandle.id).portId };
      const point = "clientY" in event ? event : event.changedTouches[0];
      const flow = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      if (state.isValid) {
        if (!state.toNode || !project.buses[state.toNode.id] || state.toHandle?.id !== BUS_TAP_HANDLE) return;
        addConnection({ from, to: { busId: state.toNode.id }, lineCount: 1, route: { tapY: Math.round(flow.y / GRID) * GRID } });
        return;
      }
      const hit = wireAt(point.clientX, point.clientY);
      const drop = hit && resolveWireDrop(project, from.deviceId, hit, flow);
      if (drop?.kind === "bundle") attachWireToBundle(drop.bundleId, from, drop.point);
      if (drop?.kind === "wire") attachWireToWire(drop.hostId, from, drop.polyline, drop.point);
    },
    [project, addConnection, attachWireToBundle, attachWireToWire, screenToFlowPosition],
  );

  const onDelete: OnDelete = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }) => {
      deletedEdges.forEach((edge) => removeConnection(edge.id));
      deletedNodes.forEach((node) => {
        if (node.type === "device") removeDevice(node.id);
        if (node.type === "bus") removeBus(node.id);
        if (node.type === "zone") removeZone(node.id);
        if (node.type === "image") removeImage(node.id);
      });
      select(null);
    },
    [removeConnection, removeDevice, removeBus, removeZone, removeImage, select],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => select(node.id), [select]);
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => select(edge.id), [select]);

  // Pictures dropped together fan out a little so none hides another.
  const addPictures = useCallback(
    async (files: File[], center: Point) => {
      const dir = useProjectStore.getState().projectDir;
      const writeAsset = dir && isDesktop() ? (name: string, ext: string, base64: string) => desktop.writeAsset(dir, name, ext, base64) : undefined;
      let last: string | undefined;
      for (const [index, file] of files.entries()) {
        try {
          const loaded = await loadSchematicImage(file, writeAsset);
          const scale = Math.min(1, IMAGE_MAX_WIDTH / loaded.width, IMAGE_MAX_HEIGHT / loaded.height);
          const size = { width: Math.max(MIN_IMAGE_EDGE, Math.round(loaded.width * scale)), height: Math.max(MIN_IMAGE_EDGE, Math.round(loaded.height * scale)) };
          const position = { x: center.x - size.width / 2 + index * 32, y: center.y - size.height / 2 + index * 32 };
          last = addImage({ src: loaded.src, name: file.name, position: snap ? snapPosition(position) : position, size });
        } catch (error) {
          window.alert(error instanceof Error ? error.message : `Could not add ${file.name}.`);
        }
      }
      if (last) select(last);
    },
    [addImage, select, snap],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const pictures = Array.from(event.dataTransfer.files).filter((file) => SCHEMATIC_IMAGE_TYPES.includes(file.type));
      if (pictures.length > 0) {
        void addPictures(pictures, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        return;
      }
      const presetId = event.dataTransfer.getData(PRESET_DRAG_TYPE);
      if (!presetId) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const position = { x: point.x - DEVICE_CARD_WIDTH / 2, y: point.y - 20 };
      select(addDevice(presetId, snap ? snapPosition(position) : position));
    },
    [screenToFlowPosition, addDevice, select, snap, addPictures],
  );

  const viewportCenter = () => {
    const pane = document.querySelector(".react-flow__pane") as HTMLElement | null;
    const rect = pane?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const point = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    return snapPosition(point);
  };

  const deviceCount = Object.values(project.devices).reduce((sum, d) => sum + d.qty, 0);

  return (
    <div className="flex h-full">
      <Library onAdd={(presetId) => select(addDevice(presetId, viewportCenter()))} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 bg-white px-5 pb-2 pt-4">
          <span className="h-10 w-1.5 shrink-0 rounded-sm bg-brand" />
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-slate-900">{project.name}</h1>
            {project.description && <div className="truncate text-[14px] text-slate-600">{project.description}</div>}
          </div>
          <AddDeviceMenu onAdd={(presetId) => select(addDevice(presetId, viewportCenter()))} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 pb-3 pt-1">
          <ToolButton active={tool === "select"} onClick={() => setTool("select")} title="Select (V)">
            <MousePointer2 className="h-4 w-4" /> Select
          </ToolButton>
          <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} title="Pan (H)">
            <Hand className="h-4 w-4" /> Pan
          </ToolButton>
          <ToolButton active={tool === "wire"} onClick={() => setTool("wire")} title="Draw a free wire (W). Click to place corners, double-click or Enter to finish.">
            <Spline className="h-4 w-4" /> Wire
          </ToolButton>
          {tool === "wire" && (
            <select className="input !w-auto py-0.5" value={drawKind} onChange={(e) => setDrawKind(e.target.value as PortKind)} title="Wire type">
              {PORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PORT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          )}
          <Divider />
          <ToolButton onClick={() => select(addBus(viewportCenter()))} title="Add a shared bus (CAN, Ethernet...)">
            <Share2 className="h-4 w-4" /> Bus
          </ToolButton>
          <ToolButton onClick={() => select(addZone(viewportCenter()))} title="Add a zone to group devices">
            <SquareDashed className="h-4 w-4" /> Zone
          </ToolButton>
          <ToolButton onClick={() => imageInput.current?.click()} title="Place a picture (or drop image files on the canvas)">
            <ImagePlus className="h-4 w-4" /> Image
          </ToolButton>
          <input
            ref={imageInput}
            type="file"
            accept={SCHEMATIC_IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) void addPictures(files, viewportCenter());
            }}
          />
          <Divider />
          <ToolButton onClick={copySelection} disabled={selectedIds.length === 0} title="Copy the selection (Cmd/Ctrl+C). A zone brings its devices along.">
            <Copy className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={() => void pasteFromClipboard()} title="Paste (Cmd/Ctrl+V)">
            <ClipboardPaste className="h-4 w-4" />
          </ToolButton>
          <Divider />
          <label className="flex items-center gap-1.5 whitespace-nowrap px-2 text-slate-600">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to grid
          </label>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-md border border-slate-300 bg-white">
              <button className="px-2 py-1.5 text-slate-700 hover:bg-slate-50" onClick={() => zoomOut()} title="Zoom out">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-14 border-x border-slate-200 text-center font-medium tabular-nums text-slate-800">{Math.round(zoom * 100)}%</span>
              <button className="px-2 py-1.5 text-slate-700 hover:bg-slate-50" onClick={() => zoomIn()} title="Zoom in">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <ToolButton onClick={() => fitView({ padding: 0.1, duration: 300 })} title="Fit to view">
              <Maximize className="h-4 w-4" /> Fit
            </ToolButton>
          </div>
        </div>

        <div className="relative min-h-0 flex-1" onDoubleClick={onDoubleClick}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            onNodesChange={onNodesChange}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onDelete={onDelete}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onPaneMouseMove={onPaneMouseMove}
            zoomOnDoubleClick={tool !== "wire"}
            onDrop={onDrop}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = event.dataTransfer.types.includes("Files") ? "copy" : "move";
            }}
            panOnDrag={tool === "pan" ? true : [1, 2]}
            // Trackpad navigation like draw.io: two-finger scroll pans, pinch zooms. With a
            // mouse wheel, hold Cmd/Ctrl to zoom.
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            panOnScrollSpeed={1}
            zoomOnScroll={false}
            zoomOnPinch
            selectionOnDrag={tool === "select"}
            nodesDraggable={tool !== "wire"}
            nodesConnectable={tool !== "wire"}
            elementsSelectable={tool !== "wire"}
            elevateEdgesOnSelect
            selectionMode={SelectionMode.Partial}
            snapToGrid={snap}
            snapGrid={[GRID, GRID]}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.15}
            maxZoom={2.5}
            connectionLineComponent={ConnectionPreview}
            defaultEdgeOptions={{ type: "wire" }}
            proOptions={{ hideAttribution: true }}
            className={`diagram-canvas ${tool === "pan" ? "pan-tool" : tool === "wire" ? "wire-tool" : ""}`}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#d3d4d0" />
            <FreeWireLayer selectedId={selectedId} onSelect={select} drawing={drawing} cursor={cursor} drawColor={PORT_COLORS[drawKind]} />
            <BundleLayer selectedId={selectedId} onSelect={select} />
          </ReactFlow>

          <Legend />
        </div>

        <div className="flex items-center gap-4 whitespace-nowrap border-t border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
          <span>{deviceCount} devices</span>
          <span>{Object.keys(project.connections).length + Object.keys(project.freeWires).length} wires</span>
          <span>{Object.keys(project.buses).length} buses</span>
          <span>{Object.keys(project.zones).length} zones</span>
          {Object.keys(project.images).length > 0 && <span>{Object.keys(project.images).length} pictures</span>}
          <span className="ml-auto min-w-0 truncate">
            {tool === "wire"
              ? drawing
                ? "Click to add a corner. Double-click or Enter to finish, Escape to cancel."
                : "Click on the canvas to start a wire."
              : "Drag a socket to another socket or bus to wire. Select a wire to drag its segments. Cmd/Ctrl+C and V copy and paste; a zone brings its devices. Backspace deletes."}
          </span>
        </div>
      </div>
      <Inspector selectedId={selectedId} onClose={() => select(null)} />
    </div>
  );
}

function snapPosition(position: { x: number; y: number }) {
  return { x: Math.round(position.x / GRID) * GRID, y: Math.round(position.y / GRID) * GRID };
}

function ToolButton({ active, disabled, onClick, title, children }: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 font-medium disabled:opacity-40 ${
        active ? "border-brand bg-brand-wash text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-slate-200" />;
}

// Places a product at the middle of the view; the library does the same by drag or click.
function AddDeviceMenu({ onAdd }: { onAdd: (presetId: string) => void }) {
  const project = useProject();
  const { open, setOpen, ref } = useDropdown();
  const presets = Object.values(project.presets).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 font-semibold text-charcoal hover:bg-brand-hover">
        <Plus className="h-4 w-4" /> Add device
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {presets.length === 0 && <div className="px-2 py-1.5 text-slate-500">No products yet. Create one in the library.</div>}
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onAdd(preset.id);
                setOpen(false);
              }}
              className="flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{preset.name}</span>
              <span className="truncate text-[11px] text-slate-500">{CATEGORY_LABELS[preset.category]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
