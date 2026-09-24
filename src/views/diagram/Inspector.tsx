import { useState } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, Crosshair, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { busesForPort, entityLabel, noteExcerpt, portKindOf, portUsage } from "@/model/derived";
import { documentsOfOwner } from "@/model/documentation";
import { isCodeLike, propLabel } from "@/model/props";
import { formatFrameRange, frameIdCount, framesForParty } from "@/model/frames";
import { useSelection } from "@/lib/selection";
import { bundleLineCount, defaultTrunk } from "./bundle-geometry";
import { DEVICE_CARD_WIDTH } from "./to-flow";
import { BUS_COLORS, CATEGORY_LABELS, PORT_COLORS, PORT_KINDS, PORT_KIND_LABELS, VARIANTS_BY_KIND, busColor, isBusRef, DEFAULT_CARD_PROPS, type CanFrame, type CardLayout, type CardPicture, type CardServices, type Connection, type PortKind, type Project } from "@/model/types";
import { useDiagramView } from "./view-state";
import { Tag, VariantBadge } from "@/components/Badges";
import { categoryIcon, documentIcon } from "@/lib/icons";
import { PresetEditor } from "./PresetEditor";
import { MIN_IMAGE_EDGE } from "./ImageNode";
import { DocumentLinks } from "@/components/DocumentLinks";
import { isLinkLike, linkHref } from "@/lib/links";
import { NameInput } from "@/views/notes/DeviceDetailsEditor";
import { EndpointBadge, ServiceForm, serviceIcon } from "@/components/Services";
import { CARD_SERVICE_ROWS, canShowOnCard, isShownOnCard } from "./card-display";

const DOT = "\u00b7";

type Tab = "overview" | "connections" | "services" | "frames" | "docs";

export function Inspector({ selectedId, onClose }: { selectedId: string | null; onClose: () => void }) {
  // An empty inspector collapses; the status bar carries the how-to hints.
  if (!selectedId) return null;
  // Editing is per selection: picking something else goes back to reading.
  return <InspectorPanel key={selectedId} selectedId={selectedId} onClose={onClose} />;
}

function InspectorPanel({ selectedId, onClose }: { selectedId: string; onClose: () => void }) {
  const project = useProject();
  const [editing, setEditing] = useState(false);

  const kind = project.devices[selectedId]
    ? "Device details"
    : project.buses[selectedId]
      ? "Bus"
      : project.zones[selectedId]
        ? "Zone"
        : project.connections[selectedId]
          ? "Connection"
          : project.freeWires[selectedId]
            ? "Free wire"
            : project.bundles[selectedId]
              ? "Wire bundle"
              : project.images[selectedId]
                ? "Picture"
                : null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0 flex-1 truncate font-semibold">{kind ?? "Selection"}</div>
        {kind && (
          <button
            onClick={() => setEditing((e) => !e)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium ${editing ? "border-brand bg-brand text-charcoal hover:bg-brand-hover" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />} {editing ? "Done" : "Edit"}
          </button>
        )}
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {project.devices[selectedId] && <DevicePanel deviceId={selectedId} editing={editing} onClose={onClose} />}
        {project.buses[selectedId] && <BusPanel busId={selectedId} editing={editing} onClose={onClose} />}
        {project.zones[selectedId] && <ZonePanel zoneId={selectedId} editing={editing} onClose={onClose} />}
        {project.connections[selectedId] && <ConnectionPanel connectionId={selectedId} editing={editing} onClose={onClose} />}
        {project.freeWires[selectedId] && <FreeWirePanel wireId={selectedId} editing={editing} onClose={onClose} />}
        {project.bundles[selectedId] && <BundlePanel bundleId={selectedId} editing={editing} onClose={onClose} />}
        {project.images[selectedId] && <ImagePanel imageId={selectedId} editing={editing} onClose={onClose} />}
        {!kind && <div className="p-3 text-slate-500">This item no longer exists.</div>}
      </div>
    </aside>
  );
}

function DevicePanel({ deviceId, editing, onClose }: { deviceId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const [tab, setTab] = useState<Tab>("overview");
  const [editingPreset, setEditingPreset] = useState(false);
  const device = project.devices[deviceId];
  const preset = project.presets[device.presetId];
  const Icon = categoryIcon(preset.category);
  const image = assetSrc(preset.imageUrl, useProjectDir());
  const zone = device.zoneId ? project.zones[device.zoneId] : null;
  const frames = framesForParty(project, deviceId);
  const frameCount = new Set([...frames.tx, ...frames.rx].map((f) => f.id)).size;
  const docs = documentsOfOwner(project, preset.id);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "connections", label: "Connections", count: connectionCount(project, deviceId) },
    { id: "services", label: "Services", count: device.services?.length },
    { id: "frames", label: "Frames", count: frameCount },
    { id: "docs", label: "Docs", count: docs.length },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-3 pb-2 pt-3">
        <div className="flex h-14 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-1">
          {image ? <img src={image} alt="" className="max-h-full max-w-full object-contain" /> : <Icon className="h-7 w-7 text-slate-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold leading-tight text-slate-900">{device.name}</div>
          <div className="truncate text-slate-500">{[CATEGORY_LABELS[preset.category], zone?.name].filter(Boolean).join(` ${DOT} `)}</div>
        </div>
        <span className="shrink-0 self-start rounded border border-slate-200 bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-700">QTY {device.qty}</span>
      </div>

      <div className="flex border-b border-slate-200 px-1 text-[12px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex min-w-0 flex-auto items-center justify-center gap-0.5 whitespace-nowrap border-b-2 px-1 py-2 ${tab === t.id ? "border-brand font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
            {!!t.count && <span className="text-[10.5px] font-normal text-slate-400">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {tab === "overview" && <DeviceOverview deviceId={deviceId} editing={editing} onClose={onClose} showTab={setTab} />}
        {tab === "connections" && <ConnectionsList deviceId={deviceId} />}
        {tab === "frames" && <FrameLists tx={frames.tx} rx={frames.rx} />}
        {tab === "services" && <ServicesTab deviceId={deviceId} editing={editing} />}
        {tab === "docs" && (
          <div className="flex flex-col gap-2 p-3">
            <div className="text-[11px] text-slate-500">Documentation belongs to the product, so every placed copy shares these links.</div>
            <DocumentLinks entityId={preset.id} readOnly={!editing} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col items-center gap-1.5 border-t border-slate-200 bg-white px-3 py-3">
        <Link to={`/notes/${preset.id}`} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2 font-semibold text-charcoal hover:bg-brand-hover">
          <BookOpen className="h-4 w-4" /> Open device documentation
        </Link>
        <button onClick={() => setEditingPreset(true)} className="text-[12px] text-slate-600 hover:text-slate-900 hover:underline">
          Edit product (ports, picture, summary)
        </button>
      </div>

      {editingPreset && <PresetEditor preset={preset} onClose={() => setEditingPreset(false)} />}
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <h3 className="text-[13px] font-bold text-slate-900">{children}</h3>
      {action}
    </div>
  );
}

function DeviceOverview({ deviceId, editing, onClose, showTab }: { deviceId: string; editing: boolean; onClose: () => void; showTab: (tab: Tab) => void }) {
  const project = useProject();
  const { select } = useSelection();
  const { updateDevice, setDeviceProp, removeDeviceProp, removeDevice } = useProjectStore();
  const [newPropKey, setNewPropKey] = useState("");
  const device = project.devices[deviceId];
  const preset = project.presets[device.presetId];
  const zone = device.zoneId ? project.zones[device.zoneId] : null;
  const usage = portUsage(project, deviceId);
  const frames = framesForParty(project, deviceId);
  const ids = (list: typeof frames.tx) => list.reduce((sum, frame) => sum + frameIdCount(frame), 0);
  const docs = documentsOfOwner(project, preset.id);
  const excerpt = noteExcerpt(project, deviceId, 240);

  return (
    <div className="flex flex-col divide-y divide-slate-200">
      <section className="p-3">
        <SectionTitle action={<span className="text-[11px] text-slate-400">This placed copy</span>}>Instance</SectionTitle>
        {preset.summary && !editing && <p className="mb-2 leading-snug text-slate-600">{preset.summary}</p>}
        {!editing ? (
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
            <ReadRow label="Name">{device.name}</ReadRow>
            <ReadRow label="Quantity">{device.qty}</ReadRow>
            <ReadRow label="Zone">{zone?.name ?? <span className="text-slate-400">None</span>}</ReadRow>
            {Object.entries(device.props).map(([key, value]) => (
              <ReadRow key={key} label={propLabel(key)} after={<CardVisibility deviceId={deviceId} propKey={key} />}>
                {!value.trim() ? (
                  <span className="text-slate-400">Not set</span>
                ) : isLinkLike(value) ? (
                  <a href={linkHref(value)} target="_blank" rel="noreferrer" className="truncate text-brand-ink hover:underline">
                    {value}
                  </a>
                ) : (
                  <span className={isCodeLike(value) ? "font-mono" : ""}>{value}</span>
                )}
              </ReadRow>
            ))}
          </dl>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Name">
              <NameInput key={deviceId} value={device.name} onCommit={(name) => updateDevice(deviceId, { name })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <input className="input" type="number" min={1} value={device.qty} onChange={(e) => updateDevice(deviceId, { qty: atLeastOne(e.target.value) })} />
              </Field>
              <Field label="Zone">
                <select className="input" value={device.zoneId ?? ""} onChange={(e) => updateDevice(deviceId, { zoneId: e.target.value || null })}>
                  <option value="">None</option>
                  {Object.values(project.zones).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {Object.entries(device.props).map(([key, value]) => (
              <Field key={key} label={propLabel(key)}>
                <div className="flex gap-1">
                  <input className={`input ${key === "ip" ? "font-mono" : ""}`} value={value} onChange={(e) => setDeviceProp(deviceId, key, e.target.value)} />
                  <CardVisibility deviceId={deviceId} propKey={key} editable />
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => removeDeviceProp(deviceId, key)} title="Remove property">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Field>
            ))}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const key = newPropKey.trim();
                if (!key || device.props[key] !== undefined) return;
                setDeviceProp(deviceId, key, "");
                setNewPropKey("");
              }}
            >
              <input className="input" placeholder="Add property (ip, canAddress, firmware...)" value={newPropKey} onChange={(e) => setNewPropKey(e.target.value)} />
              <button type="submit" className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50" title="Add property">
                <Plus className="h-4 w-4" />
              </button>
            </form>
            <div className="text-[11px] text-slate-500">These apply to this copy only. The product (ports, picture, summary) is edited separately.</div>
            <RemoveButton
              label="Remove from diagram"
              onClick={() => {
                removeDevice(deviceId);
                onClose();
              }}
            />
          </div>
        )}
      </section>

      <CardDisplaySection deviceId={deviceId} editing={editing} />

      {usage.length > 0 && (
        <section className="p-3">
          <SectionTitle
            action={
              <button onClick={() => showTab("connections")} className="text-[12px] text-brand-ink hover:underline">
                View all
              </button>
            }
          >
            Ports &amp; connections
          </SectionTitle>
          <div className="flex flex-col gap-1">
            {usage.map((port) => {
              const buses = busesForPort(project, deviceId, port.portId);
              const color = buses[0] ? busColor(buses[0]) : PORT_COLORS[port.kind];
              const connected = port.connectedTo.length > 0;
              return (
                <div key={port.portId} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: connected ? color : "white", boxShadow: `inset 0 0 0 1.5px ${color}` }} />
                  <span className="w-[124px] shrink-0 truncate">
                    <span className="font-medium text-slate-800">{port.name}</span>
                    <span className="text-slate-400">
                      {" "}
                      {DOT} {PORT_KIND_LABELS[port.kind]}
                    </span>
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {!connected && <span className="text-slate-400">Available</span>}
                    {port.connectedTo.map((id) => {
                      const bus = project.buses[id];
                      return (
                        <button key={id} onClick={() => select(id)} className="flex min-w-0 items-center gap-1 truncate text-left text-slate-800 hover:text-brand-ink hover:underline" title="Select on the canvas">
                          {bus?.tag && <Tag color={busColor(bus)}>{bus.tag}</Tag>}
                          <span className="truncate">{entityLabel(project, id)}</span>
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(frames.tx.length > 0 || frames.rx.length > 0) && (
        <section className="p-3">
          <SectionTitle
            action={
              <button onClick={() => showTab("frames")} className="text-[12px] text-brand-ink hover:underline">
                View all
              </button>
            }
          >
            CAN frames
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Transmit", list: frames.tx, Arrow: ArrowUp },
              { label: "Receive", list: frames.rx, Arrow: ArrowDown },
            ].map(({ label, list, Arrow }) => (
              <div key={label} className="rounded-md border border-slate-200 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Arrow className="h-3.5 w-3.5" /> {label}
                </div>
                <div className="text-[15px] font-bold text-slate-900">
                  {ids(list)} <span className="text-[12px] font-medium text-slate-500">ID{ids(list) === 1 ? "" : "s"}</span>
                </div>
                {list[0] ? (
                  <div className="mt-1 truncate border-t border-slate-100 pt-1 text-[11px]">
                    <div className="truncate text-slate-700">{list[0].name}</div>
                    <div className="font-mono text-slate-500">{formatFrameRange(list[0])}</div>
                  </div>
                ) : (
                  <div className="mt-1 border-t border-slate-100 pt-1 text-[11px] text-slate-400">None defined</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="p-3">
        <SectionTitle
          action={
            docs.length > 0 && (
              <button onClick={() => showTab("docs")} className="text-[12px] text-brand-ink hover:underline">
                {docs.length} linked
              </button>
            )
          }
        >
          Documentation
        </SectionTitle>
        {docs.length === 0 && !excerpt && <div className="text-slate-400">Nothing written or linked yet.</div>}
        {excerpt && <p className="mb-2 line-clamp-3 leading-snug text-slate-600">{excerpt}</p>}
        <div className="flex flex-col">
          {docs.slice(0, 3).map((doc) => {
            const DocIcon = documentIcon(doc.kind);
            return (
              <Link key={doc.id} to={`/notes/${preset.id}?doc=${doc.id}`} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                <DocIcon className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-slate-800">{doc.title}</span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-bold tracking-wide text-slate-600">{doc.kind.toUpperCase()}</span>
              </Link>
            );
          })}
          {docs.length > 3 && (
            <button onClick={() => showTab("docs")} className="self-start px-1 pt-1 text-[12px] text-brand-ink hover:underline">
              + {docs.length - 3} more
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

interface ConnectionItem {
  key: string;
  title: string;
  detail: string;
  color: string;
  tag?: string;
}

// One row per link, named for what is on the other end, with the port as supporting detail.
function deviceConnections(project: Project, deviceId: string): ConnectionItem[] {
  const items: ConnectionItem[] = [];
  const preset = project.presets[project.devices[deviceId].presetId];
  for (const conn of Object.values(project.connections)) {
    const outgoing = conn.from.deviceId === deviceId;
    const incoming = !isBusRef(conn.to) && conn.to.deviceId === deviceId;
    if (!outgoing && !incoming) continue;
    const portId = outgoing ? conn.from.portId : (conn.to as { portId: string }).portId;
    const port = preset.ports.find((p) => p.id === portId);
    if (!port) continue;
    if (outgoing && isBusRef(conn.to)) {
      const bus = project.buses[conn.to.busId];
      if (!bus) continue;
      items.push({ key: conn.id, title: bus.name, tag: bus.tag, detail: [port.name, bus.rate || "Rate TBD"].join(` ${DOT} `), color: busColor(bus) });
    } else {
      const peer = outgoing ? (conn.to as { deviceId: string }).deviceId : conn.from.deviceId;
      items.push({ key: conn.id, title: entityLabel(project, peer), detail: [PORT_KIND_LABELS[port.kind], port.name].join(` ${DOT} `), color: PORT_COLORS[port.kind] });
    }
  }
  return items;
}

function connectionCount(project: Project, deviceId: string) {
  return deviceConnections(project, deviceId).length;
}

function ConnectionsList({ deviceId }: { deviceId: string }) {
  const project = useProject();
  const { select } = useSelection();
  const [allPorts, setAllPorts] = useState(false);
  const items = deviceConnections(project, deviceId);
  return (
    <div className="flex flex-col gap-2 p-3">
      {items.length === 0 && <div className="text-slate-400">Not connected to anything yet. Drag from a tab on the card edge to connect.</div>}
      {items.length > 0 && (
        <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item) => (
            <button key={item.key} onClick={() => select(item.key)} className="flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-slate-50">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-slate-900">{item.title}</span>
                  {item.tag && <Tag color={item.color}>{item.tag}</Tag>}
                </span>
                <span className="block truncate text-[11.5px] text-slate-500">{item.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setAllPorts((v) => !v)} className="self-start text-[12px] text-brand-ink hover:underline">
        {allPorts ? "Hide connectors" : "Show all connectors"}
      </button>
      {allPorts && <PortsTable deviceId={deviceId} />}
    </div>
  );
}

function PortsTable({ deviceId }: { deviceId: string }) {
  const project = useProject();
  const usage = portUsage(project, deviceId);
  if (usage.length === 0) return <div className="p-3 text-slate-500">This product has no ports.</div>;
  return (
    <table className="w-full text-[12px]">
      <thead className="text-left text-slate-500">
        <tr>
          <th className="px-3 py-2 font-medium">Port</th>
          <th className="py-2 font-medium">Type</th>
          <th className="py-2 pr-3 font-medium">Connected to</th>
        </tr>
      </thead>
      <tbody>
        {usage.map((port) => {
          const portBuses = busesForPort(project, deviceId, port.portId);
          return (
            <tr key={port.portId} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium">{port.name}</td>
              <td className="py-1.5">
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: portBuses[0] ? busColor(portBuses[0]) : PORT_COLORS[port.kind] }} />
                {PORT_KIND_LABELS[port.kind]}
              </td>
              <td className="py-1.5 pr-3">
                {port.connectedTo.length === 0 ? <span className="text-slate-400">Available</span> : port.connectedTo.map((id) => entityLabel(project, id)).join(", ")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FrameLists({ tx, rx }: { tx: CanFrame[]; rx: CanFrame[] }) {
  return (
    <div className="flex flex-col gap-4 p-3">
      {[
        { label: "Transmits", list: tx },
        { label: "Receives", list: rx },
      ].map(({ label, list }) => (
        <div key={label}>
          <SectionTitle>
            {label} <span className="font-normal text-slate-400">{list.length}</span>
          </SectionTitle>
          {list.length === 0 && <div className="text-slate-400">None defined.</div>}
          {list.map((frame) => (
            <Link key={frame.id} to={`/communications?tab=can&selected=${frame.id}`} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <span className="min-w-0 flex-1 truncate text-slate-800">{frame.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-slate-500">{formatFrameRange(frame)}</span>
            </Link>
          ))}
        </div>
      ))}
      <Link to="/communications?tab=can" className="flex items-center gap-1 text-brand-ink hover:underline">
        Open CAN frames <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function ServicesTab({ deviceId, editing }: { deviceId: string; editing: boolean }) {
  const project = useProject();
  const { addService, updateService, removeService } = useProjectStore();
  // "new" while adding, a service id while editing one, null while reading.
  const [open, setOpen] = useState<string | null>(null);
  const device = project.devices[deviceId];
  const services = device.services ?? [];
  const current = services.find((s) => s.id === open);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <SectionTitle
          action={
            editing &&
            open !== "new" && (
              <button onClick={() => setOpen("new")} className="flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[12px] font-semibold text-charcoal hover:bg-brand-hover">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            )
          }
        >
          Services <span className="font-normal text-slate-400">{services.length}</span>
        </SectionTitle>
        <div className="text-[11px] text-slate-500">Software on this device. These are declarations, not live status.</div>
      </div>

      {services.length === 0 && open !== "new" && <div className="text-slate-400">{editing ? "No services yet. Add the software this device runs." : "No services declared."}</div>}
      {services.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200">
          {services.map((service) => {
            const ServiceIcon = serviceIcon(service);
            const active = service.id === open;
            const body = (
              <>
                <ServiceIcon className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{service.name}</span>
                  {service.description && <span className="block truncate text-[11px] text-slate-500">{service.description}</span>}
                </span>
                <EndpointBadge service={service} />
              </>
            );
            const rowClass = `flex items-center gap-2.5 border-b border-slate-100 px-2.5 py-2 text-left last:border-b-0 ${active ? "bg-brand-wash shadow-[inset_3px_0_0] shadow-brand" : "hover:bg-slate-50"}`;
            return editing ? (
              <button key={service.id} onClick={() => setOpen(service.id)} className={rowClass}>
                {body}
                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
            ) : (
              <Link key={service.id} to={`/notes/${service.id}`} className={rowClass} title="Open the service page">
                {body}
              </Link>
            );
          })}
        </div>
      )}

      {editing && open && (open === "new" || current) && (
        <div className="border-t border-slate-200 pt-3">
          <SectionTitle action={current && <span className="truncate text-[12px] text-slate-500">{current.name}</span>}>{current ? "Edit service" : "New service"}</SectionTitle>
          <ServiceForm
            key={open}
            initial={current}
            onCancel={() => setOpen(null)}
            onSave={(draft) => {
              // The draft always names description and endpoint, so a cleared field is removed.
              if (current) updateService(deviceId, current.id, draft);
              else addService(deviceId, draft);
              setOpen(null);
            }}
            onRemove={
              current &&
              (() => {
                if (!window.confirm(`Remove ${current.name}? Its notes go with it; linked documents stay.`)) return;
                removeService(deviceId, current.id);
                setOpen(null);
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ReadRow({ label, children, after }: { label: string; children: React.ReactNode; after?: React.ReactNode }) {
  return (
    <>
      <dt className="truncate capitalize text-slate-500">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-slate-800">
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {after}
      </dd>
    </>
  );
}

// Whether a property draws on this copy's schematic card. Links never do.
function CardVisibility({ deviceId, propKey, editable = false }: { deviceId: string; propKey: string; editable?: boolean }) {
  const project = useProject();
  const setCardDisplay = useProjectStore((s) => s.setCardDisplay);
  const device = project.devices[deviceId];
  if (!canShowOnCard(device.props[propKey] ?? "")) {
    return (
      <span className="shrink-0 p-1 text-slate-300" title="Links are not shown on the schematic card">
        <EyeOff className="h-3.5 w-3.5" />
      </span>
    );
  }
  const shown = isShownOnCard(device, propKey);
  const VisibilityIcon = shown ? Eye : EyeOff;
  const title = shown ? "Shown on the schematic card" : "Hidden from the schematic card";
  if (!editable) {
    return (
      <span className={`shrink-0 p-1 ${shown ? "text-slate-500" : "text-slate-300"}`} title={title}>
        <VisibilityIcon className="h-3.5 w-3.5" />
      </span>
    );
  }
  const onCard = device.card?.props ?? DEFAULT_CARD_PROPS;
  return (
    <button
      type="button"
      onClick={() => setCardDisplay(deviceId, { props: shown ? onCard.filter((k) => k !== propKey) : [...onCard, propKey] })}
      className={`shrink-0 rounded p-1 hover:bg-slate-100 ${shown ? "text-slate-600" : "text-slate-300"}`}
      title={`${title}. Click to ${shown ? "hide" : "show"} it.`}
      aria-pressed={shown}
    >
      <VisibilityIcon className="h-4 w-4" />
    </button>
  );
}

const LAYOUTS: { id: CardLayout; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "detailed", label: "Detailed" },
];

const PICTURES: { id: CardPicture; label: string }[] = [
  { id: "large", label: "Large" },
  { id: "small", label: "Small" },
  { id: "none", label: "Hidden" },
];

const SERVICE_ROWS: { id: CardServices; label: string }[] = [
  { id: "first", label: `First ${CARD_SERVICE_ROWS}` },
  { id: "all", label: "All" },
];

function CardDisplaySection({ deviceId, editing }: { deviceId: string; editing: boolean }) {
  const project = useProject();
  const setCardDisplay = useProjectStore((s) => s.setCardDisplay);
  const device = project.devices[deviceId];
  const layout = device.card?.layout ?? "overview";
  const picture = device.card?.picture ?? "large";
  const services = device.card?.services ?? "first";
  const keys = Object.keys(device.props);
  const shownCount = keys.filter((key) => isShownOnCard(device, key)).length;

  return (
    <section className="p-3">
      <SectionTitle action={<span className="text-[11px] text-slate-400">This placed copy</span>}>Card display</SectionTitle>
      <dl className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2">
        <dt className="text-slate-500">Layout</dt>
        <dd>
          {editing ? (
            <Segmented options={LAYOUTS} value={layout} onChange={(value) => setCardDisplay(deviceId, { layout: value })} />
          ) : (
            LAYOUTS.find((o) => o.id === layout)?.label
          )}
        </dd>
        {layout === "detailed" && (
          <>
            <dt className="text-slate-500">Picture</dt>
            <dd>
              {editing ? (
                <Segmented options={PICTURES} value={picture} onChange={(value) => setCardDisplay(deviceId, { picture: value })} />
              ) : (
                PICTURES.find((o) => o.id === picture)?.label
              )}
            </dd>
          </>
        )}
        <dt className="text-slate-500">Services</dt>
        <dd>
          {editing ? (
            <Segmented options={SERVICE_ROWS} value={services} onChange={(value) => setCardDisplay(deviceId, { services: value })} />
          ) : (
            SERVICE_ROWS.find((o) => o.id === services)?.label
          )}
        </dd>
        <dt className="text-slate-500">Properties</dt>
        <dd className="text-slate-800">
          {keys.length === 0 ? <span className="text-slate-400">None set</span> : `${shownCount} of ${keys.length} on the card`}
        </dd>
      </dl>
      <div className="mt-1.5 text-[11px] text-slate-500">
        {layout === "overview" ? "Overview shows identity and services. Detailed adds the picture, summary and property table. " : ""}
        {editing && keys.length > 0 ? "Use the eye beside each property to show or hide it on the card." : ""}
      </div>
    </section>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-[12px]">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`border-l border-slate-300 px-2 py-0.5 first:border-l-0 ${value === option.id ? "bg-brand-wash font-semibold text-brand-ink" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 flex items-center gap-1 self-start rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50">
      <Trash2 className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function BusPanel({ busId, editing, onClose }: { busId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const { updateBus, removeBus } = useProjectStore();
  const { highlightBusId, setHighlight } = useDiagramView();
  const bus = project.buses[busId];
  const color = busColor(bus);
  const variants = VARIANTS_BY_KIND[bus.kind] ?? [];
  const members = Object.values(project.connections)
    .filter((c) => isBusRef(c.to) && c.to.busId === busId)
    .map((c) => ({ connection: c, device: project.devices[c.from.deviceId] }))
    .filter((m) => m.device);
  const matching = members.filter((m) => portKindOf(project, m.connection.from.deviceId, m.connection.from.portId) === bus.kind).length;
  const paletteHit = BUS_COLORS.some((c) => c.value === color);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-3 border-l-4 pl-3" style={{ borderColor: color }}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-bold leading-tight">{bus.name || "Unnamed bus"}</div>
          <div className="mt-1 flex items-center gap-2 text-slate-500">
            <VariantBadge color={color}>{PORT_KIND_LABELS[bus.kind]}</VariantBadge>
            Network bus
          </div>
        </div>
        {bus.tag && <Tag color={color} size="md">{bus.tag}</Tag>}
      </div>

      <div className="text-[11px] font-semibold text-slate-700">Configuration</div>
      {!editing && (
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
          <ReadRow label="Family">{PORT_KIND_LABELS[bus.kind]}</ReadRow>
          <ReadRow label="Variant">{bus.variant || <span className="text-slate-400">Not confirmed (TBD)</span>}</ReadRow>
          <ReadRow label="Network ID">{bus.tag ? <Tag color={color}>{bus.tag}</Tag> : <span className="text-slate-400">None</span>}</ReadRow>
          <ReadRow label="Color">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded border border-slate-200" style={{ background: color }} />
              {BUS_COLORS.find((c) => c.value === color)?.name ?? "Custom"}
            </span>
          </ReadRow>
          <ReadRow label="Bitrate">{bus.rate || <span className="text-slate-400">TBD</span>}</ReadRow>
          <ReadRow label="Labels">{bus.repeatLabels ? "Repeated at each tap" : "At the top only"}</ReadRow>
        </dl>
      )}
      {editing && (
        <>
          <Field label="Family">
            <select className="input" value={bus.kind} onChange={(e) => updateBus(busId, { kind: e.target.value as PortKind })}>
              {PORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PORT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Variant">
            {variants.length > 0 ? (
              <select className="input" value={variants.includes(bus.variant ?? "") ? bus.variant : ""} onChange={(e) => updateBus(busId, { variant: e.target.value })}>
                <option value="">Not confirmed (TBD)</option>
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={bus.variant ?? ""} onChange={(e) => updateBus(busId, { variant: e.target.value })} placeholder="TBD" />
            )}
          </Field>
          <Field label="Network name">
            {/* Committed once, so the rename rewrites links from the name before editing. */}
            <NameInput key={busId} value={bus.name} onCommit={(name) => updateBus(busId, { name })} />
          </Field>
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <Field label="Network ID">
              <input className="input" value={bus.tag ?? ""} onChange={(e) => updateBus(busId, { tag: e.target.value.trim() || undefined })} placeholder="B1" />
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <span className="inline-block h-5 w-5 shrink-0 rounded border border-slate-200" style={{ background: color }} />
                <select className="input" value={paletteHit ? color : "custom"} onChange={(e) => e.target.value !== "custom" && updateBus(busId, { color: e.target.value })}>
                  {BUS_COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.name}
                    </option>
                  ))}
                  {!paletteHit && <option value="custom">Custom</option>}
                </select>
              </div>
            </Field>
          </div>
          <Field label="Bitrate">
            <input className="input" value={bus.rate} onChange={(e) => updateBus(busId, { rate: e.target.value })} placeholder="250 kbit/s" />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(bus.repeatLabels)} onChange={(e) => updateBus(busId, { repeatLabels: e.target.checked })} />
            <span>Repeat bus labels</span>
            <span className="ml-auto text-[11px] text-slate-500">{bus.tag ?? "Tag"} appears at each tap</span>
          </label>
        </>
      )}
      <button
        onClick={() => setHighlight(busId)}
        className={`flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 ${
          highlightBusId === busId ? "border-brand bg-brand text-charcoal" : "border-brand-line text-brand-ink hover:bg-brand-wash"
        }`}
      >
        <Crosshair className="h-3.5 w-3.5" /> {highlightBusId === busId ? "Stop highlighting" : "Highlight this bus"}
      </button>

      <div className="border-t border-slate-200 pt-3">
        <div className="mb-1 font-semibold">
          Members <span className="font-normal text-slate-500">{"\u00b7"} {members.length}</span>
        </div>
        {members.length === 0 && <div className="text-slate-400">Drag a wire from a port onto the bar to connect.</div>}
        {members.map(({ connection, device }) => {
          const preset = project.presets[device.presetId];
          const port = preset?.ports.find((p) => p.id === connection.from.portId);
          const image = assetSrc(preset?.imageUrl, projectDir);
          return (
            <div key={connection.id} className="flex items-center gap-2 py-1">
              <div className="flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                {image && <img src={image} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <span className="min-w-0 flex-1 truncate">{device.name}</span>
              <span className="shrink-0 text-slate-500">{port?.name ?? connection.from.portId}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5">
        <span className="text-slate-600">Compatibility</span>
        <span className={`font-semibold ${matching === members.length ? "text-green-700" : "text-amber-700"}`}>
          {matching} of {members.length} matching ports
        </span>
      </div>
      <div className="-mt-2 text-[11px] text-slate-500">Port support determines available variants.</div>

      <div>
        <div className="mb-1 font-semibold">Documentation</div>
        <DocumentLinks entityId={busId} compact readOnly={!editing} />
      </div>
      <Link to={`/notes/${busId}`} className="flex items-center gap-1 text-brand-ink hover:underline">
        Open bus notes <ExternalLink className="h-3 w-3" />
      </Link>
      {editing && (
        <RemoveButton
          label="Remove bus"
          onClick={() => {
            removeBus(busId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function ZonePanel({ zoneId, editing, onClose }: { zoneId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const { updateZone, removeZone } = useProjectStore();
  const zone = project.zones[zoneId];
  const members = Object.values(project.devices).filter((d) => d.zoneId === zoneId);

  return (
    <div className="flex flex-col gap-3 p-3">
      {editing ? (
        <Field label="Name">
          <input className="input" value={zone.name} onChange={(e) => updateZone(zoneId, { name: e.target.value })} />
        </Field>
      ) : (
        <div className="text-[16px] font-bold text-slate-900">{zone.name}</div>
      )}
      <div className="text-slate-500">
        {members.length} device{members.length === 1 ? "" : "s"}. Devices dropped inside the zone join it automatically. Drag the corner handles to resize.
      </div>
      {members.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {members.map((d) => (
            <li key={d.id} className="truncate text-slate-700">
              {d.name}
              {d.qty > 1 && <span className="text-slate-500"> x{d.qty}</span>}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RemoveButton
          label="Remove zone (keeps devices)"
          onClick={() => {
            removeZone(zoneId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function ImagePanel({ imageId, editing, onClose }: { imageId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const { updateImage, removeImage } = useProjectStore();
  const image = project.images[imageId];
  const aspect = image.size.height / image.size.width;
  const setWidth = (width: number) => {
    const clamped = Math.max(MIN_IMAGE_EDGE, Math.round(width) || MIN_IMAGE_EDGE);
    updateImage(imageId, { size: { width: clamped, height: Math.round(clamped * aspect) } });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {editing ? (
        <>
          <Field label="Caption">
            <input className="input" value={image.name ?? ""} placeholder="Picture" onChange={(e) => updateImage(imageId, { name: e.target.value })} />
          </Field>
          <Field label="Width">
            <input className="input" type="number" min={MIN_IMAGE_EDGE} value={image.size.width} onChange={(e) => setWidth(Number(e.target.value))} />
          </Field>
        </>
      ) : (
        <div className="font-semibold text-slate-900">{image.name || "Picture"}</div>
      )}
      <div className="text-slate-500">
        {image.size.width} x {image.size.height}. Drag the corner handles to resize; the picture keeps its proportions. It comes to the front while selected and sits under wires and devices otherwise.
      </div>
      {editing && (
        <RemoveButton
          label="Remove picture"
          onClick={() => {
            removeImage(imageId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function ConnectionPanel({ connectionId, editing, onClose }: { connectionId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const { updateConnection, removeConnection } = useProjectStore();
  const connection = project.connections[connectionId];
  const from = project.devices[connection.from.deviceId];
  const fromPort = project.presets[from?.presetId]?.ports.find((p) => p.id === connection.from.portId);
  const toLabel = isBusRef(connection.to)
    ? project.buses[connection.to.busId]?.name
    : `${project.devices[connection.to.deviceId]?.name} / ${
        project.presets[project.devices[connection.to.deviceId]?.presetId]?.ports.find((p) => !isBusRef(connection.to) && p.id === connection.to.portId)?.name ?? ""
      }`;
  const toBus = isBusRef(connection.to) ? project.buses[connection.to.busId] : undefined;
  const color = toBus ? busColor(toBus) : fromPort ? PORT_COLORS[fromPort.kind] : "#64748b";

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1 w-6 rounded" style={{ background: color }} />
        <span className="font-medium">{fromPort ? PORT_KIND_LABELS[fromPort.kind] : "Wire"}</span>
        {toBus?.tag && <Tag color={color}>{toBus.tag}</Tag>}
        {(toBus?.variant || fromPort?.variant) && <VariantBadge color={color}>{toBus?.variant || fromPort?.variant}</VariantBadge>}
      </div>
      <Row label="From" value={`${from?.name} / ${fromPort?.name ?? connection.from.portId}`} />
      <Row label="To" value={toLabel ?? ""} />
      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lines in bundle">
            <input className="input" type="number" min={1} value={connection.lineCount} onChange={(e) => updateConnection(connectionId, { lineCount: atLeastOne(e.target.value) })} />
          </Field>
          <Field label="Label">
            <input className="input" value={connection.label ?? ""} onChange={(e) => updateConnection(connectionId, { label: e.target.value })} placeholder="Pulse I/O" />
          </Field>
        </div>
      ) : (
        <>
          <Row label="Lines" value={String(connection.lineCount)} />
          {connection.label && <Row label="Label" value={connection.label} />}
        </>
      )}
      <div className="border-t border-slate-200 pt-3">
        <div className="mb-1 text-[11px] font-semibold text-slate-700">Routing</div>
        <div className="text-[11px] text-slate-500">
          With the wire selected, drag a segment to move it. Dragging the first or last segment adds a bend. A wire into a bus has a tap dot on the bar that drags along it.
          {editing && (connection.route?.points?.length || connection.route?.exitPoints?.length || connection.route?.centerOffset || connection.route?.tapY !== undefined ? (
            <button className="ml-1 text-brand-ink hover:underline" onClick={() => updateConnection(connectionId, { route: { points: [], exitPoints: [], centerOffset: 0, tapY: undefined } })}>
              Reset route
            </button>
          ) : null)}
        </div>
      </div>
      {editing && <BundleSection connectionId={connectionId} />}
      {editing && (
        <RemoveButton
          label="Remove wire"
          onClick={() => {
            removeConnection(connectionId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

// Where a wire runs together with others: join an existing bundle, start one with wires
// that share its destination, or leave the one it is in.
function BundleSection({ connectionId }: { connectionId: string }) {
  const project = useProject();
  const { select } = useSelection();
  const { createBundle, addToBundle, removeFromBundle } = useProjectStore();
  const connection = project.connections[connectionId];
  const [picked, setPicked] = useState<string[]>([]);
  const bundle = connection.bundleId ? project.bundles[connection.bundleId] : undefined;

  if (bundle) {
    return (
      <div className="border-t border-slate-200 pt-3">
        <div className="mb-1 text-[11px] font-semibold text-slate-700">Bundle</div>
        <div className="text-[11px] text-slate-500">
          Runs in the bundle <span className="font-medium text-slate-700">{bundle.label ?? "Unnamed bundle"}</span> with {bundle.members.length - 1} other wire
          {bundle.members.length === 2 ? "" : "s"}.
        </div>
        <div className="mt-2 flex gap-2">
          <button className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={() => select(bundle.id)}>
            Select bundle
          </button>
          <button className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={() => removeFromBundle(connectionId)}>
            Unbundle this wire
          </button>
        </div>
      </div>
    );
  }

  const key = endpointKey(connection.to);
  const candidates = Object.values(project.connections).filter((c) => c.id !== connectionId && !c.bundleId && endpointKey(c.to) === key);
  const joinable = Object.values(project.bundles).filter((b) => b.members.some((id) => endpointKey(project.connections[id]?.to) === key));

  const sourcePoint = (c: Connection) => {
    const device = project.devices[c.from.deviceId];
    return { x: device.position.x + DEVICE_CARD_WIDTH, y: device.position.y + 120 };
  };
  const targetPoint = () => {
    if (isBusRef(connection.to)) return project.buses[connection.to.busId]?.position ?? { x: 0, y: 0 };
    const device = project.devices[connection.to.deviceId];
    return { x: device.position.x, y: device.position.y + 120 };
  };
  const bundleNow = () => {
    const members = [connectionId, ...picked];
    const trunk = defaultTrunk(members.map((id) => sourcePoint(project.connections[id])), targetPoint());
    const id = createBundle(members, trunk, connection.label);
    setPicked([]);
    select(id);
  };

  if (candidates.length === 0 && joinable.length === 0) return null;
  return (
    <div className="border-t border-slate-200 pt-3">
      <div className="mb-1 text-[11px] font-semibold text-slate-700">Bundle</div>
      {joinable.map((b) => (
        <button key={b.id} className="mb-1 block text-[11px] text-brand-ink hover:underline" onClick={() => addToBundle(b.id, connectionId)}>
          Add to bundle {b.label ?? "(unnamed)"}
        </button>
      ))}
      {candidates.length > 0 && (
        <>
          <div className="text-[11px] text-slate-500">Other wires ending at the same place:</div>
          {candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5 text-[12px]">
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((id) => id !== c.id))}
              />
              <span className="truncate">{wireLabel(project, c)}</span>
            </label>
          ))}
          <button
            disabled={picked.length === 0}
            onClick={bundleNow}
            className="mt-1 rounded bg-brand px-2 py-1 text-charcoal hover:bg-brand-hover disabled:opacity-40"
          >
            Bundle {picked.length + 1} wires
          </button>
        </>
      )}
    </div>
  );
}

function endpointKey(to: Connection["to"] | undefined) {
  if (!to) return "";
  return isBusRef(to) ? `bus:${to.busId}` : `${to.deviceId}:${to.portId}`;
}

function wireLabel(project: Project, c: Connection) {
  const from = project.devices[c.from.deviceId];
  const port = project.presets[from?.presetId]?.ports.find((p) => p.id === c.from.portId);
  return `${from?.name ?? c.from.deviceId} / ${port?.name ?? c.from.portId}${c.lineCount > 1 ? ` (x${c.lineCount})` : ""}`;
}

function BundlePanel({ bundleId, editing, onClose }: { bundleId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const { select } = useSelection();
  const { updateBundle, dissolveBundle, removeFromBundle, unlinkBundle } = useProjectStore();
  const bundle = project.bundles[bundleId];
  const members = bundle.members.map((id) => project.connections[id]).filter(Boolean);
  const parent = bundle.parent ? project.bundles[bundle.parent.bundleId] : undefined;
  const children = Object.values(project.bundles).filter((b) => b.parent?.bundleId === bundleId);
  const bundleName = (b: typeof bundle) => b.label || `${bundleLineCount(project, b)} lines`;

  return (
    <div className="flex flex-col gap-3 p-3">
      {editing ? (
        <Field label="Label">
          <input className="input" value={bundle.label ?? ""} onChange={(e) => updateBundle(bundleId, { label: e.target.value })} placeholder="Valve I/O" />
        </Field>
      ) : (
        <div className="font-semibold text-slate-900">{bundle.label || "Unnamed bundle"}</div>
      )}
      <Row label="Lines" value={String(bundleLineCount(project, bundle))} />
      {parent && (
        <div className="group flex items-center gap-2 text-[12px]">
          <span className="text-slate-500">Runs into</span>
          <button className="min-w-0 flex-1 truncate text-left hover:text-brand-ink hover:underline" onClick={() => select(parent.id)}>
            {bundleName(parent)}
          </button>
          {editing && (
            <button className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100" title="Separate this trunk from the one it runs into" onClick={() => unlinkBundle(bundleId)}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {children.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-700">Trunks running into this one</div>
          {children.map((child) => (
            <div key={child.id} className="group flex items-center gap-2 py-0.5 text-[12px]">
              <button className="min-w-0 flex-1 truncate text-left hover:text-brand-ink hover:underline" onClick={() => select(child.id)}>
                {bundleName(child)}
              </button>
              {editing && (
                <button className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100" title="Separate this trunk" onClick={() => unlinkBundle(child.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="mb-1 text-[11px] font-semibold text-slate-700">Wires in this bundle</div>
        {members.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 py-0.5 text-[12px]">
            <button className="min-w-0 flex-1 truncate text-left hover:text-brand-ink hover:underline" onClick={() => select(c.id)}>
              {wireLabel(project, c)}
            </button>
            {editing && (
              <button className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100" title="Take this wire out of the bundle" onClick={() => removeFromBundle(c.id)}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
        Drag the trunk's segment and corner handles to route it. Drop a trunk end on another wire or trunk to run into it. Each wire's short tails to and from the trunk can be dragged when that wire is selected.
      </div>
      {editing && (
        <RemoveButton
          label="Unbundle all"
          onClick={() => {
            dissolveBundle(bundleId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function FreeWirePanel({ wireId, editing, onClose }: { wireId: string; editing: boolean; onClose: () => void }) {
  const project = useProject();
  const { updateFreeWire, removeFreeWire } = useProjectStore();
  const wire = project.freeWires[wireId];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1 w-6 rounded" style={{ background: PORT_COLORS[wire.kind] }} />
        <span className="font-medium">Not attached to any port</span>
      </div>
      {!editing && (
        <>
          <Row label="Type" value={PORT_KIND_LABELS[wire.kind]} />
          <Row label="Lines" value={String(wire.lineCount)} />
          {wire.label && <Row label="Label" value={wire.label} />}
        </>
      )}
      {editing && (
        <>
          <Field label="Type">
            <select className="input" value={wire.kind} onChange={(e) => updateFreeWire(wireId, { kind: e.target.value as PortKind })}>
              {PORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PORT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lines in bundle">
              <input className="input" type="number" min={1} value={wire.lineCount} onChange={(e) => updateFreeWire(wireId, { lineCount: atLeastOne(e.target.value) })} />
            </Field>
            <Field label="Label">
              <input className="input" value={wire.label ?? ""} onChange={(e) => updateFreeWire(wireId, { label: e.target.value })} placeholder="Valve I/O" />
            </Field>
          </div>
        </>
      )}
      <div className="text-[11px] text-slate-500">
        {wire.points.length} corners. Drag a corner or a segment handle to reshape. Backspace deletes the wire.
      </div>
      {editing && (
        <RemoveButton
          label="Remove wire"
          onClick={() => {
            removeFreeWire(wireId);
            onClose();
          }}
        />
      )}
    </div>
  );
}

// Counts typed into number inputs: empty, negative or fractional values become 1.
function atLeastOne(value: string) {
  return Math.max(1, Math.floor(Number(value)) || 1);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-12 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium capitalize text-slate-500">{label}</span>
      {children}
    </label>
  );
}
