import { Fragment, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowDownToLine, ArrowUpFromLine, FileCode2, FileText, Plus, Trash2, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { docHref } from "@/views/notes/NotesView";
import { endpointDevice, endpointLabel, endpointService, fieldTypeLabel, messageMeta, messagesByDevice, messageTouches, suggestedTransport, type DeviceMessages } from "@/model/messages";
import type { MessageEndpoint, Project, ProtoField, ProtoMessage } from "@/model/types";
import { MessageTable } from "./MessageTable";
import { ProtoImportButton } from "./ProtoImportButton";
import { CountBadge, PartyThumb, SidebarSection } from "@/views/frames/FramesView";

const DOT = "\u00b7";

type Direction = "all" | "sent" | "received";
type Mode = "messages" | "by-device";

export function ProtobufView() {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const addMessage = useProjectStore((s) => s.addMessage);
  const [query, setQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [direction, setDirection] = useState<Direction>("all");
  const [mode, setMode] = useState<Mode>("messages");

  const messages = useMemo(() => Object.values(project.messages).sort((a, b) => a.name.localeCompare(b.name)), [project.messages]);
  const byDevice = useMemo(() => messagesByDevice(project), [project]);
  const selected = selectedId ? project.messages[selectedId] : undefined;
  const needle = query.trim().toLowerCase();
  const visible = messages.filter((message) => {
    if (deviceFilter && !messageTouches(message, deviceFilter, direction)) return false;
    if (!needle) return true;
    const services = [message.sender, ...message.receivers].map((end) => endpointService(project, end)?.name);
    const devices = [message.sender, ...message.receivers].map((end) => endpointLabel(project, end));
    return [message.name, message.schemaFile, message.transport, ...services, ...devices, ...message.fields.map((f) => f.name)].some((text) => text?.toLowerCase().includes(needle));
  });
  const visibleIds = new Set(visible.map((m) => m.id));

  // Devices on either end of the listed messages, for their documentation.
  const related = Array.from(
    new Set(visible.flatMap((m) => [m.sender, ...m.receivers].map((end) => endpointDevice(project, end)?.id).filter((id): id is string => !!id))),
  ).map((id) => project.devices[id]);

  const showAll = () => {
    setDeviceFilter("");
    setDirection("all");
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <div className="px-4 pt-4 text-[15px] font-semibold">Message library</div>
        <div className="flex flex-col gap-2 p-3">
          <button onClick={showAll} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left ${!deviceFilter ? "bg-brand-wash font-medium text-brand-ink" : "hover:bg-slate-50"}`}>
            <FileCode2 className="h-4 w-4" />
            <span className="flex-1">All messages</span>
            <CountBadge active={!deviceFilter}>{messages.length}</CountBadge>
          </button>
          <input className="input" aria-label="Search messages" placeholder="Find a message, service or field..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <SidebarSection title="By device" caption="Tx / Rx counts are messages">
          {byDevice.length === 0 && <div className="px-3 py-1 text-slate-400">No message has a sender or receiver yet.</div>}
          {byDevice.map((entry) => (
            <button
              key={entry.deviceId}
              onClick={() => setDeviceFilter(deviceFilter === entry.deviceId ? "" : entry.deviceId)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${deviceFilter === entry.deviceId ? "bg-brand-wash" : "hover:bg-slate-50"}`}
            >
              <PartyThumb project={project} partyId={entry.deviceId} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{project.devices[entry.deviceId].name}</span>
              <span className="shrink-0 text-[11px] text-slate-500">
                Tx {entry.sent.length} {DOT} Rx {entry.received.length}
              </span>
            </button>
          ))}
        </SidebarSection>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <div className="mr-auto text-slate-600">
            {visible.length === messages.length ? `${messages.length} message${messages.length === 1 ? "" : "s"}` : `${visible.length} of ${messages.length} messages`}
          </div>
          <select className="input" style={{ width: "auto" }} aria-label="Device" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
            <option value="">All devices</option>
            {Object.values(project.devices).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: "auto" }} aria-label="Direction" value={direction} disabled={!deviceFilter} onChange={(e) => setDirection(e.target.value as Direction)} title={deviceFilter ? undefined : "Pick a device first"}>
            <option value="all">Sent and received</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
          </select>
          <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white">
            {(["messages", "by-device"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-brand text-charcoal" : "text-slate-600 hover:bg-slate-50"}`}>
                {m === "messages" ? "Messages" : "By device"}
              </button>
            ))}
          </div>
        </div>

        {mode === "messages" ? (
          <MessageTable
            rows={visible.map((message) => ({
              key: message.id,
              icon: <FileCode2 className="h-4 w-4 shrink-0 text-brand-ink" />,
              name: message.name,
              meta: messageMeta(message),
              from: endpointLabel(project, message.sender),
              fromDetail: endpointService(project, message.sender)?.name,
              to: message.receivers.map((r) => endpointLabel(project, r)).filter((label): label is string => !!label),
              toDetail: message.receivers.map((r) => endpointService(project, r)?.name).filter(Boolean).join(", ") || undefined,
              transport: message.transport,
              selected: message.id === selectedId,
              onClick: () => select(message.id),
            }))}
            empty={
              messages.length === 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <span>No Protobuf messages yet. Import your .proto files, or add a message by hand.</span>
                  <span className="flex gap-2">
                    <ProtoImportButton subtle />
                    <button onClick={() => select(addMessage())} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash">
                      <Plus className="h-4 w-4" /> Add message
                    </button>
                  </span>
                </div>
              ) : (
                "Nothing matches."
              )
            }
          />
        ) : (
          <MessagesByDevice
            project={project}
            entries={byDevice
              .filter((entry) => !deviceFilter || entry.deviceId === deviceFilter)
              .map((entry) => ({ ...entry, sent: entry.sent.filter((m) => visibleIds.has(m.id)), received: entry.received.filter((m) => visibleIds.has(m.id)) }))}
            direction={direction}
            selectedId={selectedId}
            onSelect={select}
          />
        )}

        {related.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-5">
            <h2 className="text-[16px] font-semibold text-slate-900">Related device documentation</h2>
            <div className="mt-0.5 text-slate-500">Documentation for the devices that send or receive these messages.</div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {related.map((device) => (
                <Link key={device.id} to={docHref(project, device.presetId)} className="flex items-center gap-1.5 text-brand-ink underline-offset-2 hover:underline">
                  <FileText className="h-4 w-4 text-slate-500" /> {device.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Keyed so an edit in progress never carries over to another message. */}
      {selected && <MessageInspector key={selected.id} message={selected} onClose={() => select(null)} />}
    </div>
  );
}

// Each device's messages, split into what it sends and what it receives, as on the CAN tab.
function MessagesByDevice({
  project,
  entries,
  direction,
  selectedId,
  onSelect,
}: {
  project: Project;
  entries: DeviceMessages[];
  direction: Direction;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (entries.length === 0) return <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">No message has a sender or receiver yet.</div>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.deviceId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
            <PartyThumb project={project} partyId={entry.deviceId} />
            <span className="font-semibold text-slate-800">{project.devices[entry.deviceId].name}</span>
            <span className="ml-auto text-[12px] text-slate-500">
              Tx {entry.sent.length} {DOT} Rx {entry.received.length}
            </span>
          </div>
          {direction !== "received" && (
            <DirectionList project={project} title="Sends" icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-brand-ink" />} messages={entry.sent} other={(m) => m.receivers} selectedId={selectedId} onSelect={onSelect} />
          )}
          {direction !== "sent" && (
            <DirectionList project={project} title="Receives" icon={<ArrowDownToLine className="h-3.5 w-3.5 text-teal-600" />} messages={entry.received} other={(m) => (m.sender ? [m.sender] : [])} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
      ))}
    </div>
  );
}

function DirectionList({
  project,
  title,
  icon,
  messages,
  other,
  selectedId,
  onSelect,
}: {
  project: Project;
  title: string;
  icon: React.ReactNode;
  messages: ProtoMessage[];
  // The ends on the other side: receivers of what is sent, the sender of what is received.
  other: (message: ProtoMessage) => MessageEndpoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon} {title} <span className="font-normal normal-case text-slate-400">{messages.length === 0 ? "none" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}</span>
      </div>
      <div className="flex flex-col py-1">
        {messages.map((message) => (
          <button key={message.id} onClick={() => onSelect(message.id)} className={`flex items-center gap-3 px-4 py-1 text-left ${message.id === selectedId ? "bg-brand-wash text-brand-ink" : "hover:bg-slate-50"}`}>
            <span className="w-40 truncate font-medium">{message.name}</span>
            <span className="w-32 truncate font-mono text-[12px] text-slate-600">{messageMeta(message)}</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1 text-slate-600">
              {other(message).map((end, index) => (
                <span key={index} className="inline-flex items-center gap-1 rounded bg-slate-100 py-0.5 pl-0.5 pr-1.5 text-[12px] text-slate-700">
                  <PartyThumb project={project} partyId={end.deviceId} size="sm" />
                  {endpointLabel(project, end) ?? "Unknown device"}
                  {endpointService(project, end) && <span className="text-slate-500">/ {endpointService(project, end)!.name}</span>}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "definition", label: "Definition" },
  { id: "routing", label: "Routing" },
  { id: "documentation", label: "Documentation" },
] as const;

// Every property is edited in place, like a CAN frame's.
function MessageInspector({ message, onClose }: { message: ProtoMessage; onClose: () => void }) {
  const project = useProject();
  const { updateMessage, removeMessage } = useProjectStore();
  const scroller = useRef<HTMLDivElement>(null);
  const suggestion = suggestedTransport(project, message);

  const jump = (id: string) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{message.name || "Untitled message"}</h2>
          <div className="mt-0.5 text-slate-500">Protobuf message</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex border-b border-slate-200 px-4">
        {SECTIONS.map((section) => (
          <button key={section.id} onClick={() => jump(section.id)} className="border-b-2 border-transparent px-2.5 py-2 text-slate-600 hover:border-slate-300 hover:text-slate-900">
            {section.label}
          </button>
        ))}
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section data-section="definition" className="flex flex-col gap-3">
          <Field label="Name">
            <input className="input" value={message.name} onChange={(e) => updateMessage(message.id, { name: e.target.value })} />
          </Field>
          <Field label="Schema source" group>
            <div className="flex gap-2">
              <input className="input font-mono" aria-label="Schema file" placeholder="drive_control.proto" value={message.schemaFile ?? ""} onChange={(e) => updateMessage(message.id, { schemaFile: e.target.value || undefined })} />
              <input className="input w-20 font-mono" aria-label="Schema version" placeholder="v1" value={message.version ?? ""} onChange={(e) => updateMessage(message.id, { version: e.target.value || undefined })} />
            </div>
          </Field>
          <Field label="Fields" group>
            <FieldsTable message={message} />
          </Field>
        </section>

        <section data-section="routing" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Routing</h3>
          <Field label="Sender" icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-brand-ink" />} group>
            <div className="grid grid-cols-[1fr_1fr_20px] gap-1.5">
              <EndpointPicker project={project} name="Sender" value={message.sender} optional onChange={(sender) => updateMessage(message.id, { sender })} />
            </div>
          </Field>
          <Field label="Receivers" icon={<ArrowDownToLine className="h-3.5 w-3.5 text-teal-600" />} group>
            {message.receivers.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_20px] items-center gap-1.5">
                {message.receivers.map((receiver, index) => (
                  // Imported messages can list the same receiver twice.
                  <Fragment key={`${index}:${receiver.deviceId}:${receiver.serviceId ?? ""}`}>
                    <EndpointPicker
                      project={project}
                      name={`Receiver ${index + 1}`}
                      value={receiver}
                      onChange={(next) => updateMessage(message.id, { receivers: message.receivers.map((r, i) => (i === index && next ? next : r)) })}
                    />
                    <button
                      onClick={() => updateMessage(message.id, { receivers: message.receivers.filter((_, i) => i !== index) })}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      title="Remove receiver"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
            <select
              className="input text-slate-500"
              aria-label="Add receiver"
              value=""
              onChange={(e) => e.target.value && updateMessage(message.id, { receivers: [...message.receivers, { deviceId: e.target.value }] })}
            >
              <option value="">+ Add receiver</option>
              {Object.values(project.devices).map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transport">
            <input
              className="input"
              placeholder={suggestion ?? "ZMQ, WebSocket, UDP broadcast..."}
              value={message.transport ?? ""}
              onChange={(e) => updateMessage(message.id, { transport: e.target.value || undefined })}
            />
          </Field>
          {!message.transport && suggestion && (
            <button onClick={() => updateMessage(message.id, { transport: suggestion })} className="-mt-1 self-start text-brand-ink hover:underline" title="Use the sender service's port">
              Use {suggestion}
            </button>
          )}
          <div className="text-[12px] text-slate-500">The message format and its transport are set separately.</div>
        </section>

        <section data-section="documentation" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={message.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={message.id} />
          </div>
        </section>

        <button
          onClick={() => {
            if (!window.confirm(`Remove ${message.name || "this message"}? Its notes and document links go with it.`)) return;
            removeMessage(message.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1 rounded border border-red-200 px-2 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove message
        </button>
      </div>
    </aside>
  );
}

// A label around a group of controls would click the first of them (a remove button) when
// its text is clicked, so groups get a plain heading instead.
function Field({ label, icon, group = false, children }: { label: string; icon?: React.ReactNode; group?: boolean; children: React.ReactNode }) {
  const heading = (
    <span className="flex items-center gap-1 text-[12px] font-medium text-slate-500">
      {icon} {label}
    </span>
  );
  if (group) {
    return (
      <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1">
        {heading}
        {children}
      </div>
    );
  }
  return (
    <label className="flex min-w-0 flex-col gap-1">
      {heading}
      {children}
    </label>
  );
}

// "repeated" is typed in front of the type, as in the schema.
const REPEATED = "repeated ";

function parseFieldType(text: string): Pick<ProtoField, "type" | "repeated"> {
  return text.startsWith(REPEATED) ? { type: text.slice(REPEATED.length), repeated: true } : { type: text, repeated: undefined };
}

function FieldsTable({ message }: { message: ProtoMessage }) {
  const updateMessage = useProjectStore((s) => s.updateMessage);
  const setField = (index: number, patch: Partial<ProtoField>) =>
    updateMessage(message.id, { fields: message.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) });
  const cell = "input !border-transparent !bg-transparent !px-1 font-mono hover:!border-slate-200 focus:!border-[var(--color-accent)]";

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className="grid grid-cols-[48px_1fr_1fr_24px] bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-600">
        <span>Tag</span>
        <span>Field</span>
        <span>Type</span>
        <span />
      </div>
      {message.fields.length === 0 && <div className="px-3 py-2 text-slate-400">No fields.</div>}
      {message.fields.map((field, index) => (
        <div key={index} className="grid grid-cols-[48px_1fr_1fr_24px] items-center gap-1 border-t border-slate-100 px-3 py-1 font-mono text-[12px]">
          <input className={`${cell} text-slate-500`} aria-label={`Field ${index + 1} tag`} inputMode="numeric" value={field.tag} onChange={(e) => setField(index, { tag: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          <input className={`${cell} text-slate-900`} aria-label={`Field ${index + 1} name`} value={field.name} onChange={(e) => setField(index, { name: e.target.value })} />
          <input className={`${cell} text-slate-700`} aria-label={`Field ${index + 1} type`} value={fieldTypeLabel(field)} onChange={(e) => setField(index, parseFieldType(e.target.value))} />
          <button onClick={() => updateMessage(message.id, { fields: message.fields.filter((_, i) => i !== index) })} className="text-slate-400 hover:text-red-700" title="Remove field">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => updateMessage(message.id, { fields: [...message.fields, { tag: Math.max(0, ...message.fields.map((f) => f.tag)) + 1, name: "field", type: "string" }] })}
        className="flex w-full items-center gap-1 border-t border-slate-100 px-3 py-1.5 text-brand-ink hover:bg-slate-50"
      >
        <Plus className="h-3.5 w-3.5" /> Field
      </button>
    </div>
  );
}

// A device, then optionally one of its services, as two selects. An optional end (the
// sender) can be unset; a receiver is removed with its own button instead.
function EndpointPicker({
  project,
  name,
  value,
  optional = false,
  onChange,
}: {
  project: Project;
  name: string;
  value: MessageEndpoint | undefined;
  optional?: boolean;
  onChange: (end: MessageEndpoint | undefined) => void;
}) {
  const device = endpointDevice(project, value);
  const services = device?.services ?? [];
  const missingService = !!value?.serviceId && !endpointService(project, value);
  return (
    <>
      <select className="input" aria-label={`${name} device`} value={value?.deviceId ?? ""} onChange={(e) => onChange(e.target.value ? { deviceId: e.target.value } : undefined)}>
        {(optional || !value) && <option value="">Not set</option>}
        {value && !device && <option value={value.deviceId}>Unknown device</option>}
        {Object.values(project.devices).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label={`${name} service`}
        value={value?.serviceId ?? ""}
        disabled={!device || (services.length === 0 && !missingService)}
        onChange={(e) => value && onChange(e.target.value ? { deviceId: value.deviceId, serviceId: e.target.value } : { deviceId: value.deviceId })}
      >
        <option value="">{!device ? "Service" : services.length > 0 ? "Any service" : "No services"}</option>
        {missingService && <option value={value.serviceId}>Missing service</option>}
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>
      {optional && <span />}
    </>
  );
}
