import { useState } from "react";
import { Cog, Globe, Network, Trash2 } from "lucide-react";
import { formatEndpoint, isValidPort } from "@/model/services";
import type { DeviceService, ServiceEndpoint } from "@/model/types";

export function serviceIcon(service: DeviceService) {
  if (!service.endpoint) return Cog;
  return /https?|web/i.test(service.endpoint.protocol ?? "") ? Globe : Network;
}

export function EndpointBadge({ service, long = false }: { service: DeviceService; long?: boolean }) {
  const endpoint = formatEndpoint(service.endpoint);
  if (!endpoint) {
    return <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10.5px] text-slate-500">{long ? "No network port" : "No port"}</span>;
  }
  return (
    <span className="shrink-0 rounded bg-blue-50 px-1.5 py-px font-mono text-[10.5px] font-semibold text-blue-700">
      {[service.endpoint?.protocol, endpoint].filter(Boolean).join(" \u00b7 ")}
    </span>
  );
}

export type ServiceDraft = Omit<DeviceService, "id">;

// Add or edit one service. The endpoint is optional: plenty of software needs no port,
// and a port of 0 is never stored to mean "none".
export function ServiceForm({
  initial,
  onSave,
  onCancel,
  onRemove,
}: {
  initial?: DeviceService;
  onSave: (draft: ServiceDraft) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [exposesPort, setExposesPort] = useState(!!initial?.endpoint);
  const [transport, setTransport] = useState<ServiceEndpoint["transport"]>(initial?.endpoint?.transport ?? "tcp");
  const [port, setPort] = useState(initial?.endpoint ? String(initial.endpoint.port) : "");
  const [protocol, setProtocol] = useState(initial?.endpoint?.protocol ?? "");

  const portNumber = Number(port);
  const portError = exposesPort && !isValidPort(portNumber) ? "Enter a port from 1 to 65535." : null;
  const canSave = name.trim() !== "" && !portError;

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      endpoint: exposesPort ? { transport, port: portNumber, protocol: protocol.trim() || undefined } : undefined,
    });
  };

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-slate-500">
          Service name <span className="text-brand-ink">*</span>
        </span>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="CAN bridge" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-slate-500">Description</span>
        <textarea className="input min-h-[56px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this software does on the device" />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-500">
          Network endpoint <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={exposesPort} onChange={(e) => setExposesPort(e.target.checked)} />
          Expose a network port
        </label>
        {!exposesPort && <span className="text-[11px] text-slate-400">This service does not need a network port.</span>}
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Transport</span>
            <select className="input" disabled={!exposesPort} value={transport} onChange={(e) => setTransport(e.target.value as ServiceEndpoint["transport"])}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Port</span>
            <input
              className="input font-mono"
              inputMode="numeric"
              disabled={!exposesPort}
              placeholder={exposesPort ? "8100" : "Not required"}
              value={exposesPort ? port : ""}
              onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
        </div>
        {exposesPort && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Protocol label</span>
            <input className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="HTTP" />
          </label>
        )}
        {exposesPort && port !== "" && portError && <span className="text-[11px] text-red-600">{portError}</span>}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={!canSave} className="rounded-md bg-brand px-3 py-1.5 font-semibold text-charcoal hover:bg-brand-hover disabled:opacity-50">
          Save service
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto flex items-center gap-1 text-red-700 hover:underline">
            <Trash2 className="h-3.5 w-3.5" /> Remove service
          </button>
        )}
      </div>
    </form>
  );
}
