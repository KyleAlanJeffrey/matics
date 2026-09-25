import { useState } from "react";
import { useSearchParams } from "react-router";
import { Boxes, Braces, Database, FileCode2, Network, Plus, Search, Waypoints } from "lucide-react";
import { useProject } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { communicationRows, type CommunicationRow } from "@/model/messages";
import { FramesView } from "@/views/frames/FramesView";
import { IoImportButton } from "@/views/io/IoImportButton";
import { ProtobufView } from "./ProtobufView";
import { ModbusView, resolveInterface } from "./ModbusView";
import { ApiView } from "./ApiView";
import { ConnectionsView } from "./ConnectionsView";
import { ServicesView } from "./ServicesView";
import { MessageTable } from "./MessageTable";
import { ProtoImportButton } from "./ProtoImportButton";

const TABS = ["all", "can", "protobuf", "modbus", "api", "connections", "services"] as const;
type Tab = (typeof TABS)[number];
type Kind = CommunicationRow["kind"];

const ADD_LABELS: Record<Tab, string> = {
  all: "Add message",
  can: "Add frame",
  protobuf: "Add message",
  modbus: "Add mapping",
  api: "Add API",
  connections: "Add connection",
  services: "Add service",
};

const KIND_LABELS: Record<Kind, string> = { can: "CAN", protobuf: "Protobuf", modbus: "Modbus", api: "API" };

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === "can") return <Network className="h-4 w-4 shrink-0 text-[#713bc4]" />;
  if (kind === "protobuf") return <FileCode2 className="h-4 w-4 shrink-0 text-brand-ink" />;
  if (kind === "api") return <Braces className="h-4 w-4 shrink-0 text-sky-600" />;
  return <Database className="h-4 w-4 shrink-0 text-emerald-600" />;
}

// Messages exchanged between devices and services. CAN frame definitions, Protobuf
// messages, fieldbus mappings and APIs each keep their own fields; "All" lists them together.
export function CommunicationsView() {
  const project = useProject();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "all";
  const { selectedId } = useSelection();
  // The current tab's create form is open in place of its inspector.
  const [adding, setAdding] = useState(false);
  const frameCount = Object.keys(project.frames).length;
  const messageCount = Object.keys(project.messages).length;
  const mappingCount = Object.keys(project.netMappings).length;
  const currentInterface = tab === "modbus" ? resolveInterface(project, params.get("interface"), selectedId) : undefined;

  const setTab = (next: Tab, selected?: string) => {
    setAdding(false);
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("tab", next);
        if (selected) out.set("selected", selected);
        else out.delete("selected");
        return out;
      },
      { replace: true },
    );
  };

  const add = () => {
    if (tab === "all") setTab("protobuf");
    setAdding(true);
  };

  return (
    <div className="flex h-full flex-col bg-white text-[13px]">
      <div className="border-b border-slate-200 px-6 pt-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold leading-tight text-slate-900">Communications</h1>
            <div className="mt-0.5 text-slate-500">Messages exchanged between devices and services</div>
          </div>
          {tab === "modbus" ? (
            <IoImportButton
              defaultDeviceId={currentInterface?.deviceId}
              onImported={({ interfaceId }) =>
                interfaceId &&
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("interface", interfaceId);
                    next.delete("selected");
                    return next;
                  },
                  { replace: true },
                )
              }
            />
          ) : (
            tab !== "api" && tab !== "connections" && tab !== "services" && <ProtoImportButton onImported={() => setTab("protobuf")} />
          )}
          <button
            onClick={add}
            disabled={tab === "modbus" && !currentInterface}
            title={tab === "modbus" && !currentInterface ? "Add an interface first" : undefined}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 font-semibold text-charcoal hover:bg-brand-hover disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {ADD_LABELS[tab]}
          </button>
        </div>
        <div className="mt-3 flex gap-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All
          </TabButton>
          <TabButton active={tab === "can"} onClick={() => setTab("can")} icon={<Network className="h-4 w-4 text-[#713bc4]" />}>
            CAN {"\u00b7"} {frameCount}
          </TabButton>
          <TabButton active={tab === "protobuf"} onClick={() => setTab("protobuf")} icon={<FileCode2 className="h-4 w-4 text-brand-ink" />}>
            Protobuf {"\u00b7"} {messageCount}
          </TabButton>
          <TabButton active={tab === "modbus"} onClick={() => setTab("modbus")} icon={<Database className="h-4 w-4 text-emerald-600" />}>
            Modbus {"\u00b7"} {mappingCount}
          </TabButton>
          <TabButton active={tab === "api"} onClick={() => setTab("api")} icon={<Braces className="h-4 w-4 text-sky-600" />}>
            API {"\u00b7"} {Object.keys(project.apis).length}
          </TabButton>
          <TabButton active={tab === "connections"} onClick={() => setTab("connections")} icon={<Waypoints className="h-4 w-4 text-slate-500" />}>
            Connections {"\u00b7"} {Object.keys(project.routes).length}
          </TabButton>
          <TabButton active={tab === "services"} onClick={() => setTab("services")} icon={<Boxes className="h-4 w-4 text-slate-500" />}>
            Services
          </TabButton>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "can" && <FramesView adding={adding} onAdding={setAdding} />}
        {tab === "protobuf" && <ProtobufView adding={adding} onAdding={setAdding} />}
        {tab === "modbus" && <ModbusView adding={adding} onAdding={setAdding} />}
        {tab === "api" && <ApiView adding={adding} onAdding={setAdding} />}
        {tab === "connections" && <ConnectionsView adding={adding} onAdding={setAdding} />}
        {tab === "services" && <ServicesView adding={adding} onAdding={setAdding} />}
        {tab === "all" && <AllCommunications onOpen={(row) => setTab(row.kind, row.id)} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-3 pb-2 pt-1 text-[14px] ${active ? "border-brand font-semibold text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function AllCommunications({ onOpen }: { onOpen: (row: CommunicationRow) => void }) {
  const project = useProject();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [deviceId, setDeviceId] = useState("");
  const all = communicationRows(project);
  const needle = query.trim().toLowerCase();
  const rows = all.filter(
    (row) =>
      (kind === "all" || row.kind === kind) &&
      (!deviceId || row.deviceIds.includes(deviceId)) &&
      (!needle || [row.name, row.meta, row.from, ...row.to, row.transport].some((text) => text?.toLowerCase().includes(needle))),
  );
  const counts = (Object.keys(KIND_LABELS) as Kind[]).map((k) => `${all.filter((row) => row.kind === k).length} ${KIND_LABELS[k]}`);
  const onRows = new Set(all.flatMap((row) => row.deviceIds));
  const devices = Object.values(project.devices).filter((d) => onRows.has(d.id));
  const filtered = !!needle || kind !== "all" || !!deviceId;

  return (
    <div className="h-full overflow-y-auto bg-slate-50/60 p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-8" aria-label="Search messages" placeholder="Search messages, devices or transports..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-slate-600">
          Type
          <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind | "all")}>
            <option value="all">All</option>
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-slate-600">
          Device
          <select className="input !w-auto" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">All</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mb-2 text-[12px] text-slate-500">
        {all.length} definition{all.length === 1 ? "" : "s"}: {counts.join(", ")}
      </div>
      <MessageTable
        rows={rows.map((row) => ({
          key: `${row.kind}:${row.id}`,
          icon: <KindIcon kind={row.kind} />,
          name: row.name,
          meta: row.meta,
          badge: KIND_LABELS[row.kind],
          from: row.from,
          // An API's callers come from its connections, not from a field on the API.
          fromMissing: row.kind === "api" ? "No caller linked" : undefined,
          to: row.to,
          transport: row.transport,
          onClick: () => onOpen(row),
        }))}
        empty={
          filtered ? (
            <button
              onClick={() => {
                setQuery("");
                setKind("all");
                setDeviceId("");
              }}
              className="text-brand-ink hover:underline"
            >
              Clear filters
            </button>
          ) : (
            "No CAN frames, Protobuf messages, network mappings or APIs yet."
          )
        }
      />
      {filtered && (
        <div className="mt-2 text-[12px] text-slate-500">
          {rows.length} of {all.length} shown
        </div>
      )}
    </div>
  );
}
