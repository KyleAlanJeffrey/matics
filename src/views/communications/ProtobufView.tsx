import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { FileCode2, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { docHref } from "@/views/notes/NotesView";
import { endpointDevice, endpointLabel, endpointService, fieldTypeLabel, messageMeta, messageTouches, suggestedTransport } from "@/model/messages";
import type { MessageEndpoint, Project, ProtoField, ProtoMessage } from "@/model/types";
import { MessageTable } from "./MessageTable";
import { ProtoImportButton } from "./ProtoImportButton";

type Direction = "all" | "sent" | "received";

export function ProtobufView() {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const addMessage = useProjectStore((s) => s.addMessage);
  const [query, setQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [direction, setDirection] = useState<Direction>("all");

  const messages = useMemo(() => Object.values(project.messages).sort((a, b) => a.name.localeCompare(b.name)), [project.messages]);
  const selected = selectedId ? project.messages[selectedId] : undefined;
  const needle = query.trim().toLowerCase();
  const visible = messages.filter((message) => {
    if (deviceFilter && !messageTouches(message, deviceFilter, direction)) return false;
    if (!needle) return true;
    const services = [message.sender, ...message.receivers].map((end) => endpointService(project, end)?.name);
    const devices = [message.sender, ...message.receivers].map((end) => endpointLabel(project, end));
    return [message.name, message.schemaFile, message.transport, ...services, ...devices, ...message.fields.map((f) => f.name)].some((text) => text?.toLowerCase().includes(needle));
  });

  // Devices on either end of the listed messages, for their documentation.
  const related = Array.from(
    new Set(visible.flatMap((m) => [m.sender, ...m.receivers].map((end) => endpointDevice(project, end)?.id).filter((id): id is string => !!id))),
  ).map((id) => project.devices[id]);

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="input min-w-[16rem] flex-1" aria-label="Search messages" placeholder="Search messages, devices, services or fields..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input" style={{ width: "auto" }} aria-label="Device" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
            <option value="">Device: All</option>
            {Object.values(project.devices).map((device) => (
              <option key={device.id} value={device.id}>
                Device: {device.name}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: "auto" }} aria-label="Direction" value={direction} disabled={!deviceFilter} onChange={(e) => setDirection(e.target.value as Direction)} title={deviceFilter ? undefined : "Pick a device first"}>
            <option value="all">Direction: All</option>
            <option value="sent">Direction: Sent</option>
            <option value="received">Direction: Received</option>
          </select>
        </div>

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
        <div className="mt-2 text-[12px] text-slate-500">
          {visible.length === messages.length ? `${messages.length} message${messages.length === 1 ? "" : "s"}` : `${visible.length} of ${messages.length} messages`}
        </div>

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

const SECTIONS = [
  { id: "definition", label: "Definition" },
  { id: "routing", label: "Routing" },
  { id: "documentation", label: "Documentation" },
] as const;

function MessageInspector({ message, onClose }: { message: ProtoMessage; onClose: () => void }) {
  const project = useProject();
  const { updateMessage, removeMessage } = useProjectStore();
  const [editing, setEditing] = useState(false);
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
          {editing ? (
            <input className="input font-semibold" aria-label="Message name" value={message.name} onChange={(e) => updateMessage(message.id, { name: e.target.value })} />
          ) : (
            <h2 className="truncate text-[20px] font-bold text-slate-900">{message.name}</h2>
          )}
          <div className="mt-0.5 text-slate-500">Protobuf message</div>
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 ${editing ? "border-brand bg-brand-wash text-brand-ink" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
        >
          <Pencil className="h-3.5 w-3.5" /> {editing ? "Done" : "Edit"}
        </button>
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
          <div>
            <Label>Schema source</Label>
            {editing ? (
              <div className="flex gap-2">
                <input className="input font-mono" aria-label="Schema file" placeholder="drive_control.proto" value={message.schemaFile ?? ""} onChange={(e) => updateMessage(message.id, { schemaFile: e.target.value || undefined })} />
                <input className="input w-20 font-mono" aria-label="Schema version" placeholder="v1" value={message.version ?? ""} onChange={(e) => updateMessage(message.id, { version: e.target.value || undefined })} />
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono">{message.schemaFile ?? <span className="text-slate-400">Not set</span>}</div>
                {message.version && <div className="rounded-md border border-slate-200 px-2.5 py-1.5 font-mono">{message.version}</div>}
              </div>
            )}
          </div>
          <div>
            <Label>Fields</Label>
            <FieldsTable message={message} editing={editing} />
          </div>
        </section>

        <section data-section="routing" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Routing</h3>
          <EndpointRow label="Sender" project={project} end={message.sender} editing={editing} onChange={(sender) => updateMessage(message.id, { sender })} />
          {(message.receivers.length ? message.receivers : [undefined]).map((receiver, index) => (
            <EndpointRow
              key={index}
              label={index === 0 ? "Receiver" : ""}
              name={`Receiver ${index + 1}`}
              project={project}
              end={receiver}
              editing={editing}
              onChange={(next) => {
                const receivers = [...message.receivers];
                if (next) receivers[index] = next;
                else receivers.splice(index, 1);
                updateMessage(message.id, { receivers });
              }}
            />
          ))}
          {editing && message.receivers.length > 0 && (
            <button
              onClick={() => updateMessage(message.id, { receivers: [...message.receivers, { deviceId: Object.keys(project.devices)[0] }] })}
              className="ml-[88px] flex items-center gap-1 self-start text-brand-ink hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Another receiver
            </button>
          )}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2">
            <span className="text-slate-500">Transport</span>
            {editing ? (
              <input
                className="input"
                aria-label="Transport"
                placeholder={suggestion ?? "ZMQ, WebSocket, UDP broadcast..."}
                value={message.transport ?? ""}
                onChange={(e) => updateMessage(message.id, { transport: e.target.value || undefined })}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className={`flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 ${message.transport ? "" : "text-slate-400"}`}>{message.transport ?? "Not set"}</span>
                {!message.transport && suggestion && (
                  <button onClick={() => updateMessage(message.id, { transport: suggestion })} className="shrink-0 text-brand-ink hover:underline" title="Use the sender service's port">
                    Use {suggestion}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="text-[12px] text-slate-500">The message format and its transport are set separately.</div>
        </section>

        <section data-section="documentation" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={message.id} compact readOnly={!editing} />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={message.id} />
          </div>
        </section>

        {editing && (
          <button
            onClick={() => {
              if (!window.confirm(`Remove ${message.name}? Its notes and document links go with it.`)) return;
              removeMessage(message.id);
              onClose();
            }}
            className="flex items-center gap-1 self-start text-red-700 hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove message
          </button>
        )}
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-medium text-slate-500">{children}</div>;
}

function FieldsTable({ message, editing }: { message: ProtoMessage; editing: boolean }) {
  const updateMessage = useProjectStore((s) => s.updateMessage);
  const setField = (index: number, patch: Partial<ProtoField>) =>
    updateMessage(message.id, { fields: message.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) });

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
        <div key={index} className="grid grid-cols-[48px_1fr_1fr_24px] items-center gap-1 border-t border-slate-100 px-3 py-1.5 font-mono text-[12px]">
          {editing ? (
            <>
              <input className="input !px-1 font-mono" aria-label={`Field ${index + 1} tag`} inputMode="numeric" value={field.tag} onChange={(e) => setField(index, { tag: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              <input className="input !px-1 font-mono" aria-label={`Field ${index + 1} name`} value={field.name} onChange={(e) => setField(index, { name: e.target.value })} />
              <input className="input !px-1 font-mono" aria-label={`Field ${index + 1} type`} value={field.type} onChange={(e) => setField(index, { type: e.target.value })} />
              <button onClick={() => updateMessage(message.id, { fields: message.fields.filter((_, i) => i !== index) })} className="text-slate-400 hover:text-red-700" title="Remove field">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-500">{field.tag}</span>
              <span className="truncate text-slate-900">{field.name}</span>
              <span className="truncate text-slate-700">{fieldTypeLabel(field)}</span>
              <span />
            </>
          )}
        </div>
      ))}
      {editing && (
        <button
          onClick={() => updateMessage(message.id, { fields: [...message.fields, { tag: Math.max(0, ...message.fields.map((f) => f.tag)) + 1, name: "field", type: "string" }] })}
          className="flex w-full items-center gap-1 border-t border-slate-100 px-3 py-1.5 text-brand-ink hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Field
        </button>
      )}
    </div>
  );
}

function EndpointRow({
  label,
  name = label,
  project,
  end,
  editing,
  onChange,
}: {
  label: string;
  // Accessible name for the selects, for rows whose visible label is blank.
  name?: string;
  project: Project;
  end: MessageEndpoint | undefined;
  editing: boolean;
  onChange: (end: MessageEndpoint | undefined) => void;
}) {
  const device = endpointDevice(project, end);
  const service = endpointService(project, end);
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-2">
      <span className="pt-1.5 text-slate-500">{label}</span>
      {editing ? (
        <div className="flex flex-col gap-1">
          <select className="input" aria-label={`${name} device`} value={end?.deviceId ?? ""} onChange={(e) => onChange(e.target.value ? { deviceId: e.target.value } : undefined)}>
            <option value="">Not set</option>
            {Object.values(project.devices).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {device && (device.services?.length ?? 0) > 0 && (
            <select className="input" aria-label={`${name} service`} value={end?.serviceId ?? ""} onChange={(e) => onChange({ deviceId: device.id, serviceId: e.target.value || undefined })}>
              <option value="">Any service</option>
              {device.services!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div>
          <div className={`rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 ${device ? "" : "text-slate-400"}`}>{device?.name ?? "Not set"}</div>
          {device && (
            <div className="mt-0.5 text-[12px] text-slate-500">
              {service ? (
                <Link to={`/notes/${service.id}`} className="text-brand-ink hover:underline">
                  {service.name}
                </Link>
              ) : (
                "Service not assigned"
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
