import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, NodeToolbar, Position, useStore, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, ArrowUpRight, Cog, FileText } from "lucide-react";
import { useProject, useProjectDir } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { CATEGORY_LABELS, CATEGORY_ROLE, PORT_COLORS, PORT_KIND_LABELS, PORT_KIND_SHORT, type DeviceInstance, type DevicePreset, type DeviceService, type PortTemplate } from "@/model/types";
import { busesForPort, entityLabel, noteKeyFor, portUsage } from "@/model/derived";
import { documentsOfOwner } from "@/model/documentation";
import { frameIdCount, framesForParty } from "@/model/frames";
import { isCodeLike, propLabel } from "@/model/props";
import { busColor } from "@/model/types";
import { categoryIcon } from "@/lib/icons";
import { DEVICE_CARD_WIDTH, portHandleId, type DeviceNodeType } from "./to-flow";
import { Tag } from "@/components/Badges";
import { serviceIcon } from "@/components/Services";
import { CARD_SERVICE_ROWS, cardProps } from "./card-display";

export function DeviceNode({ id, data, selected, dragging }: NodeProps<DeviceNodeType>) {
  const project = useProject();
  const wiring = useStore((s) => s.connection.inProgress);
  const preview = useHoverPreview(Boolean(selected) || Boolean(dragging) || wiring);
  const [hovered, setHovered] = useState(false);
  const { connectedHandles } = data;
  // The node can render once more after its device is deleted, before React Flow drops it.
  const device = project.devices[id] ?? data.device;
  const preset = project.presets[device.presetId];
  const Icon = categoryIcon(preset?.category ?? "other");
  const detailed = device.card?.layout === "detailed";
  const tabs = edgeTabs(preset, connectedHandles, hovered || Boolean(selected) || wiring);
  const minHeight = TAB_TOP + Math.max(tabs.connectedLeft, tabs.connectedRight) * TAB_GAP + 6;
  // React Flow only measures handles when the node resizes, and it ignores a drag from, or
  // a drop near, a handle it has not measured. Free tabs come and go without a resize.
  const updateNodeInternals = useUpdateNodeInternals();
  const tabKey = tabs.slots.map((s) => `${s.port.id}:${s.side}:${s.slot}`).join(",");
  useLayoutEffect(() => updateNodeInternals(id), [id, tabKey, updateNodeInternals]);

  return (
    <div
      className="relative"
      style={{ width: DEVICE_CARD_WIDTH }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <DevicePopover deviceId={id} visible={preview.open} onEnter={preview.enter} onLeave={preview.leave} />
      <EdgeTabs deviceId={id} tabs={tabs} connectedHandles={connectedHandles} />
      {!detailed && device.qty > 1 && (
        <>
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-lg border border-slate-300 bg-white" />
          <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border border-slate-300 bg-white" />
        </>
      )}
      <div
        onMouseEnter={preview.enter}
        onMouseLeave={preview.leave}
        style={{ minHeight }}
        className={`relative flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow ${
          selected ? "border-brand shadow-[0_0_0_3px_rgba(242,106,33,0.22)]" : "border-slate-300"
        }`}
      >
        {detailed ? (
          <>
            <StandardHeader device={device} Icon={Icon} />
            <ServiceRows services={device.services ?? []} showAll={device.card?.services === "all"} />
          </>
        ) : (
          <OverviewBody device={device} Icon={Icon} />
        )}
      </div>
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

function StandardHeader({ device, Icon }: { device: DeviceInstance; Icon: IconType }) {
  const project = useProject();
  const preset = project.presets[device.presetId];
  const shown = cardProps(device);
  const ip = shown.find(([key]) => key === "ip")?.[1];
  const details = shown.filter(([key]) => key !== "ip");
  const picture = device.card?.picture ?? "large";

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pb-0.5 pt-2">
        <span className="truncate text-[13.5px] font-bold text-slate-900">{device.name}</span>
        <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-700">QTY {device.qty}</span>
      </div>

      {picture !== "none" && <UnitGrid preset={preset} qty={device.qty} Icon={Icon} small={picture === "small"} />}

      <div className={`px-3 pb-1.5 text-center leading-tight ${picture === "none" ? "pt-1" : ""}`}>
        {ip && (
          <div className="mb-1 flex justify-center">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10.5px] text-slate-700">IP {ip}</span>
          </div>
        )}
        {preset?.summary && <div className="line-clamp-2 text-[11px] font-medium text-slate-600">{preset.summary}</div>}
      </div>

      {details.length > 0 && <PropTable entries={details} />}
    </>
  );
}

function PropTable({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="mx-3 mb-2 grid grid-cols-[minmax(0,max-content)_minmax(4rem,1fr)] gap-x-2.5 overflow-hidden rounded-md border border-slate-100 bg-slate-50/70 px-2 py-1 text-[10.5px] leading-[1.35]">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="max-w-[7.5rem] truncate py-px text-slate-500" title={propLabel(key)}>{propLabel(key)}</dt>
          <dd className={`truncate py-px text-slate-800 ${isCodeLike(value) ? "font-mono" : "font-medium"}`} title={value}>
            {value.trim() || <span className="font-normal text-slate-400">Not set</span>}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

// Who the device is and what runs on it. In both layouts ports live on the edge tabs.
function OverviewBody({ device, Icon }: { device: DeviceInstance; Icon: IconType }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const preset = project.presets[device.presetId];
  const image = assetSrc(preset?.imageUrl, projectDir);
  const docs = documentsOfOwner(project, device.presetId).length;
  const shown = cardProps(device);
  const ip = shown.find(([key]) => key === "ip")?.[1];
  const details = shown.filter(([key]) => key !== "ip");
  const role = preset?.role || CATEGORY_ROLE[preset?.category ?? "other"];

  return (
    <>
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <div className="flex h-[22px] w-[28px] shrink-0 items-center justify-center overflow-hidden">
          {image ? <img src={image} alt="" draggable={false} className="h-full w-full object-contain" /> : <Icon className="h-4 w-4 text-slate-400" />}
        </div>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-slate-900">{device.name}</span>
        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10.5px] font-semibold text-slate-600">x{device.qty}</span>
      </div>
      <div className="flex items-baseline gap-2 px-2.5 pb-1.5 pl-[46px] text-[10.5px] text-slate-500">
        <span className="min-w-0 flex-1 truncate">{role}</span>
        {ip && <span className="shrink-0 font-mono text-slate-700">{ip}</span>}
      </div>
      {details.length > 0 && <PropTable entries={details} />}
      <ServiceRows services={device.services ?? []} showAll={device.card?.services === "all"} emptyText="No services configured" />
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-2.5 py-1 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" /> {docs} {docs === 1 ? "doc" : "docs"}
        </span>
        <Link to={`/notes/${device.presetId}`} className="nodrag flex items-center gap-0.5 hover:text-slate-900 hover:underline" onClick={(event) => event.stopPropagation()}>
          Details <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </>
  );
}

const TAB_TOP = 40;
const TAB_GAP = 18;
const TAB_OUT = 30;
const TAB_WIDTH = 34;

interface EdgeTabSlot {
  port: PortTemplate;
  side: "left" | "right";
  slot: number;
}

interface EdgeTabLayout {
  slots: EdgeTabSlot[];
  connectedLeft: number;
  connectedRight: number;
}

// Connected ports take the first slots on their side in the order they were wired, so
// wiring another port never moves an existing wire. Revealing the free ports (on hover,
// selection or while wiring) only adds tabs below them.
function edgeTabs(preset: DevicePreset | undefined, connectedHandles: string[], revealAll: boolean): EdgeTabLayout {
  const slots: EdgeTabSlot[] = [];
  const count = { left: 0, right: 0 };
  for (const side of ["left", "right"] as const) {
    const ports = preset?.ports ?? [];
    const connected = connectedHandles
      .map((handle) => ports.find((port) => portHandleId(port.id, side) === handle))
      .filter((port): port is PortTemplate => port !== undefined);
    const free = revealAll ? ports.filter((port) => !connected.includes(port)) : [];
    count[side] = connected.length;
    [...connected, ...free].forEach((port, slot) => slots.push({ port, side, slot }));
  }
  return { slots, connectedLeft: count.left, connectedRight: count.right };
}

function EdgeTabs({ deviceId, tabs, connectedHandles }: { deviceId: string; tabs: EdgeTabLayout; connectedHandles: string[] }) {
  return (
    <>
      {tabs.slots.map(({ port, side, slot }) => (
        <EdgeTab key={`${port.id}:${side}`} deviceId={deviceId} port={port} side={side} top={TAB_TOP + slot * TAB_GAP} connected={connectedHandles.includes(portHandleId(port.id, side))} />
      ))}
    </>
  );
}

function EdgeTab({ deviceId, port, side, top, connected }: { deviceId: string; port: PortTemplate; side: "left" | "right"; top: number; connected: boolean }) {
  const project = useProject();
  const [hover, setHover] = useState(false);
  const buses = busesForPort(project, deviceId, port.id);
  const bus = buses[0];
  const color = bus ? busColor(bus) : PORT_COLORS[port.kind];
  const peers = portUsage(project, deviceId).find((usage) => usage.portId === port.id)?.connectedTo ?? [];
  const target = bus
    ? buses.map((b) => [b.tag, b.name].filter(Boolean).join(" ")).join(", ")
    : peers.map((peer) => entityLabel(project, peer)).join(", ");
  const tags = buses.map((b) => b.tag).filter(Boolean);
  const detail = bus ? [bus.variant || PORT_KIND_LABELS[port.kind], bus.rate || "Rate TBD"].join(" \u00b7 ") : [PORT_KIND_LABELS[port.kind], port.variant].filter(Boolean).join(" \u00b7 ");

  return (
    <Handle
      id={portHandleId(port.id, side)}
      type="source"
      position={side === "left" ? Position.Left : Position.Right}
      className={`edge-tab ${connected ? "connected" : ""}`}
      style={{ top, [side]: -TAB_OUT, width: TAB_WIDTH, ["--handle-color" as string]: color }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className={`pointer-events-none flex h-full items-center justify-center text-[8.5px] font-bold leading-none ${side === "right" ? "ml-auto" : ""}`}
        style={{ width: TAB_OUT, color: connected ? color : "#7a8086" }}
      >
        {tags.length ? tags.join("/") : PORT_KIND_SHORT[port.kind]}
      </span>
      {hover && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-charcoal px-2 py-1 text-left text-[10.5px] leading-tight text-white shadow-lg ${side === "left" ? "right-full mr-1.5" : "left-full ml-1.5"}`}
        >
          <span className="block font-semibold">
            {port.name}
            {target ? ` \u2192 ${target}` : " \u00b7 not connected"}
          </span>
          <span className="block text-slate-300">{detail}</span>
        </span>
      )}
    </Handle>
  );
}

// At most CARD_SERVICE_ROWS rows unless the card is set to show all; the rest are a count,
// and the inspector has them all.
function ServiceRows({ services, showAll, emptyText }: { services: DeviceService[]; showAll: boolean; emptyText?: string }) {
  if (services.length === 0) {
    if (!emptyText) return null;
    return <div className="border-t border-slate-100 px-3 py-1.5 text-center text-[10.5px] text-slate-400">{emptyText}</div>;
  }
  const shown = showAll ? services : services.slice(0, CARD_SERVICE_ROWS);
  const rest = services.length - shown.length;
  return (
    <div className="border-t border-slate-100 px-3 pb-1.5 pt-1">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-500">
        Services <span className="font-normal">{services.length}</span>
        {rest > 0 && <span className="ml-auto font-medium">+{rest} more</span>}
      </div>
      {shown.map((service) => {
        const ServiceIcon = serviceIcon(service);
        return (
          <div key={service.id} className="flex h-[19px] items-center gap-1.5 text-[11px]">
            <ServiceIcon className="h-3 w-3 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate text-slate-800" title={service.description}>{service.name}</span>
            {service.endpoint ? (
              <span className="shrink-0 font-mono text-[10.5px] text-slate-600">{service.endpoint.transport === "udp" ? "UDP " : ""}:{service.endpoint.port}</span>
            ) : (
              <span className="shrink-0 text-[10px] text-slate-400">No port</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const MAX_TILES = 6;

// One picture per unit, laid out like the reference: a single large image, two side by
// side, or a three-wide grid. Beyond MAX_TILES the remainder is a count.
function UnitGrid({ preset, qty, Icon, small }: { preset: DevicePreset | undefined; qty: number; Icon: IconType; small: boolean }) {
  const image = assetSrc(preset?.imageUrl, useProjectDir());
  const shown = Math.min(qty, MAX_TILES);
  const cols = qty === 1 ? 1 : qty === 2 ? 2 : 3;
  const cellHeight = (qty === 1 ? 120 : qty === 2 ? 80 : 60) / (small ? 2 : 1);
  const tiles = Array.from({ length: shown }, (_, i) => i);
  const rest = qty - shown;

  return (
    <div className="relative grid gap-1.5 px-3 py-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {tiles.map((i) => (
        <div key={i} className="flex items-center justify-center overflow-hidden" style={{ height: cellHeight }}>
          {image ? (
            <img src={image} alt="" draggable={false} className="h-full w-full object-contain" />
          ) : (
            <Icon className={qty === 1 ? "h-14 w-14 text-slate-300" : "h-8 w-8 text-slate-300"} />
          )}
        </div>
      ))}
      {rest > 0 && (
        <div className="absolute bottom-2 right-3 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-white">+{rest} more</div>
      )}
    </div>
  );
}

const HOVER_DELAY_MS = 350;
const HOVER_GRACE_MS = 150;

// Hover intent for the preview: it opens after a short rest on the card, survives the
// pointer crossing into the preview, and never shows for a selected or moving device
// (the inspector has the details then).
function useHoverPreview(blocked: boolean) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const enter = () => {
    clear();
    if (!open) timer.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  };
  const leave = () => {
    clear();
    timer.current = setTimeout(() => setOpen(false), HOVER_GRACE_MS);
  };

  useEffect(() => {
    if (!blocked) return;
    clear();
    setOpen(false);
  }, [blocked]);
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open: open && !blocked, enter, leave };
}

// Quick look at a hovered device: what it is, where it talks and what is written about
// it. Clicking the device opens the full inspector instead.
function DevicePopover({ deviceId, visible, onEnter, onLeave }: { deviceId: string; visible: boolean; onEnter: () => void; onLeave: () => void }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const placement = usePopoverPlacement(deviceId, visible);

  const device = project.devices[deviceId];
  const preset = device ? project.presets[device.presetId] : undefined;
  if (!device || !preset || !visible) return null;

  const Icon = categoryIcon(preset.category);
  const image = assetSrc(preset.imageUrl, projectDir);
  const zone = device.zoneId ? project.zones[device.zoneId] : null;
  const buses = Array.from(new Set(preset.ports.flatMap((port) => busesForPort(project, deviceId, port.id))));
  const frames = framesForParty(project, deviceId);
  const ids = (list: typeof frames.tx) => list.reduce((sum, frame) => sum + frameIdCount(frame), 0);
  const docs = documentsOfOwner(project, noteKeyFor(project, deviceId)).length;

  return (
    <NodeToolbar isVisible position={placement.side} offset={POPOVER_OFFSET} align="start" className="nodrag nopan">
      <div
        ref={placement.ref}
        role="tooltip"
        style={{ width: POPOVER_WIDTH, transform: `translate(${placement.shiftX}px, ${placement.shift}px)`, maxHeight: placement.maxHeight, visibility: placement.measured ? "visible" : "hidden" }}
        className="overflow-y-auto rounded-xl border border-slate-200 bg-white text-[12px] shadow-2xl"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50">
            {image ? <img src={image} alt="" className="h-full w-full object-contain" /> : <Icon className="h-6 w-6 text-slate-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold leading-tight text-slate-900">{device.name}</div>
            <div className="truncate text-slate-500">{[CATEGORY_LABELS[preset.category], zone?.name].filter(Boolean).join(" \u00b7 ")}</div>
          </div>
          <span className="shrink-0 self-start rounded border border-slate-200 bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-700">QTY {device.qty}</span>
        </div>

        <dl className="grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-2 px-4 py-3">
          {device.props.ip && (
            <>
              <dt className="text-slate-500">IP address</dt>
              <dd className="font-mono text-slate-800">{device.props.ip}</dd>
            </>
          )}
          <dt className="self-start text-slate-500">Networks</dt>
          <dd className="flex flex-col gap-1">
            {buses.length === 0 && <span className="text-slate-400">None</span>}
            {buses.map((bus) => (
              <span key={bus.id} className="flex items-center gap-1.5">
                {bus.tag && <Tag color={busColor(bus)}>{bus.tag}</Tag>}
                <span className="truncate text-slate-800">{bus.name}</span>
              </span>
            ))}
          </dd>
          {(frames.tx.length > 0 || frames.rx.length > 0) && (
            <>
              <dt className="text-slate-500">CAN IDs</dt>
              <dd className="flex items-center gap-3 text-slate-800">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3.5 w-3.5 text-slate-500" /> Tx {ids(frames.tx)}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowDown className="h-3.5 w-3.5 text-slate-500" /> Rx {ids(frames.rx)}
                </span>
              </dd>
            </>
          )}
          <dt className="text-slate-500">Services</dt>
          <dd className="flex items-center gap-1.5 text-slate-800">
            <Cog className="h-3.5 w-3.5 text-slate-500" /> {device.services?.length ? `${device.services.length} declared` : "None"}
          </dd>
          <dt className="text-slate-500">Documents</dt>
          <dd className="flex items-center gap-1.5 text-slate-800">
            <FileText className="h-3.5 w-3.5 text-slate-500" /> {docs === 0 ? "None linked" : `${docs} linked`}
          </dd>
        </dl>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11.5px]">
          <span className="text-slate-500">Click the device for details</span>
          <Link to={`/notes/${preset.id}`} className="flex items-center gap-0.5 font-medium text-brand-ink hover:underline">
            Documentation <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </NodeToolbar>
  );
}

const EDGE_MARGIN = 12;
const POPOVER_WIDTH = 300;
// Clears the edge tabs on overview cards.
const POPOVER_OFFSET = 14 + TAB_OUT;

// Keeps the popover inside the canvas: to the right of the card when it fits, else the
// left; when neither fits, on the roomier side and slid sideways over the card. It is
// top-aligned with the card, slid up as far as needed to stay in view, and never taller
// than the canvas, scrolling inside instead.
function usePopoverPlacement(deviceId: string, open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ side: Position.Right, shift: 0, shiftX: 0, maxHeight: undefined as number | undefined, measured: false });
  // Re-place whenever the canvas pans or zooms, or the device is dragged. Closed popovers
  // (one per card) must not re-render on every pan frame.
  const transform = useStore((s) => (open ? s.transform.join(",") : ""));
  const at = useStore((s) => {
    if (!open) return "";
    const node = s.nodeLookup.get(deviceId);
    return node ? `${node.internals.positionAbsolute.x},${node.internals.positionAbsolute.y}` : "";
  });

  useLayoutEffect(() => {
    if (!open) {
      setPlacement((p) => (p.measured ? { ...p, measured: false } : p));
      return;
    }
    const place = () => {
      const card = document.querySelector(`.react-flow__node[data-id="${CSS.escape(deviceId)}"]`)?.getBoundingClientRect();
      const canvas = ref.current?.closest(".react-flow")?.getBoundingClientRect();
      const popover = ref.current;
      if (!card || !canvas || !popover) return;
      const room = canvas.height - 2 * EDGE_MARGIN;
      const height = Math.min(popover.scrollHeight, room);
      const fitsRight = card.right + POPOVER_OFFSET + POPOVER_WIDTH <= canvas.right - EDGE_MARGIN;
      const fitsLeft = card.left - POPOVER_OFFSET - POPOVER_WIDTH >= canvas.left + EDGE_MARGIN;
      const roomRight = canvas.right - card.right;
      const roomLeft = card.left - canvas.left;
      const side = fitsRight || (!fitsLeft && roomRight >= roomLeft) ? Position.Right : Position.Left;
      const left = side === Position.Right ? card.right + POPOVER_OFFSET : card.left - POPOVER_OFFSET - POPOVER_WIDTH;
      const clampedLeft = Math.min(Math.max(left, canvas.left + EDGE_MARGIN), canvas.right - EDGE_MARGIN - POPOVER_WIDTH);
      const top = Math.min(Math.max(card.top, canvas.top + EDGE_MARGIN), canvas.bottom - EDGE_MARGIN - height);
      const next = { side, shift: Math.round(top - card.top), shiftX: Math.round(clampedLeft - left), maxHeight: room, measured: true };
      setPlacement((p) =>
        p.side === next.side && p.shift === next.shift && p.shiftX === next.shiftX && p.maxHeight === next.maxHeight && p.measured ? p : next,
      );
    };
    place();
    // The picture loads after the first layout and changes the height.
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [deviceId, open, transform, at]);

  return { ref, ...placement };
}
