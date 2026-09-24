import { useState } from "react";
import { ChevronDown, ChevronUp, Crosshair } from "lucide-react";
import { useProject } from "@/store/project-store";
import { busColor, PORT_COLORS, PORT_KIND_LABELS, type PortKind } from "@/model/types";
import { useDiagramView, type VisibilityKey } from "./view-state";
import { Tag } from "@/components/Badges";

const FAMILIES: PortKind[] = ["ethernet", "can", "gmsl", "pulse", "digital-out", "valve"];
const DOT = "\u00b7";

interface Entry {
  key: VisibilityKey;
  label: string;
  color: string;
  tag?: string;
  detail?: string;
  busId?: string;
}

// Legend for the canvas. Each bus is its own entry so two networks of the same family
// read apart; the expanded panel toggles visibility and highlights one bus.
export function Legend() {
  const project = useProject();
  const { hidden, highlightBusId, toggleHidden, setHighlight } = useDiagramView();
  const [open, setOpen] = useState(false);

  const buses = Object.values(project.buses);
  const busKinds = new Set(buses.map((b) => b.kind));
  const busEntries: Entry[] = buses.map((bus) => ({
    key: `bus:${bus.id}`,
    label: bus.name,
    tag: bus.tag,
    color: busColor(bus),
    detail: [bus.variant || "Variant TBD", bus.rate].filter(Boolean).join(` ${DOT} `),
    busId: bus.id,
  }));
  const familyEntries: Entry[] = FAMILIES.filter((kind) => !busKinds.has(kind)).map((kind) => ({
    key: `kind:${kind}`,
    label: PORT_KIND_LABELS[kind],
    color: PORT_COLORS[kind],
  }));

  return (
    <div className="absolute bottom-3 left-3 flex flex-col items-start gap-2 text-[11px]">
      {open && (
        <div className="w-72 rounded-md border border-slate-200 bg-white/95 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <span className="font-semibold text-slate-700">Networks</span>
            <button className="rounded p-0.5 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} title="Collapse">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col py-1">
            {busEntries.map((entry) => (
              <label key={entry.key} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50">
                <input type="checkbox" checked={!hidden.includes(entry.key)} onChange={() => toggleHidden(entry.key)} />
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: entry.color }} />
                {entry.tag && <Tag color={entry.color}>{entry.tag}</Tag>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{entry.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{entry.detail}</span>
                </span>
                <button
                  className={`rounded p-1 ${highlightBusId === entry.busId ? "bg-brand text-charcoal" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                  title={highlightBusId === entry.busId ? "Stop highlighting" : "Highlight this bus"}
                  onClick={(event) => {
                    event.preventDefault();
                    setHighlight(entry.busId ?? null);
                  }}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>
              </label>
            ))}
            {busEntries.length > 0 && familyEntries.length > 0 && <div className="my-1 border-t border-slate-100" />}
            {familyEntries.map((entry) => (
              <label key={entry.key} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50">
                <input type="checkbox" checked={!hidden.includes(entry.key)} onChange={() => toggleHidden(entry.key)} />
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: entry.color }} />
                <span className="font-medium text-slate-800">{entry.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 whitespace-nowrap rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm">
        <button className="flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900" onClick={() => setOpen((v) => !v)} title="Show or hide networks">
          Network legend {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {[...busEntries, ...familyEntries].map((entry) => {
          const isHidden = hidden.includes(entry.key);
          return (
            <span key={entry.key} className={`flex items-center gap-1.5 ${isHidden ? "text-slate-400 line-through" : ""}`}>
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: entry.color, opacity: isHidden ? 0.4 : 1 }} />
              {entry.tag ? `${PORT_KIND_LABELS[project.buses[entry.busId ?? ""]?.kind ?? "can"]} (${entry.tag})` : entry.label}
            </span>
          );
        })}
        <span className="flex items-center gap-1.5 border-l border-slate-200 pl-3 text-slate-500">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" /> Connected
          <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-400" /> Available
        </span>
      </div>
    </div>
  );
}
