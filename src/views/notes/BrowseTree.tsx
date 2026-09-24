import { useState } from "react";
import { Link } from "react-router";
import { FileText, Folder, Search, Share2 } from "lucide-react";
import { useProject } from "@/store/project-store";
import { ALL_DOCUMENTS, OVERVIEW_ID, UNFILED, unfiledDocuments } from "@/model/documentation";
import { CATEGORY_LABELS, busColor, type DeviceCategory, type Project } from "@/model/types";
import { categoryIcon } from "@/lib/icons";
import { docHref } from "./NotesView";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as DeviceCategory[];

// Products in library order, each with the total number of units placed.
function deviceRows(project: Project) {
  const units: Record<string, number> = {};
  for (const device of Object.values(project.devices)) units[device.presetId] = (units[device.presetId] ?? 0) + device.qty;
  return Object.values(project.presets)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name))
    .map((preset) => ({ preset, units: units[preset.id] ?? 0 }));
}

// A flat list: zones and categories already live on the schematic, and folders here only
// hid devices one click deeper.
export function BrowseTree({ current }: { current: string }) {
  const project = useProject();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const devices = deviceRows(project).filter(({ preset }) => matches(`${preset.name} ${preset.manufacturer} ${preset.model}`));
  const buses = Object.values(project.buses)
    .filter((bus) => matches(`${bus.name} ${bus.tag ?? ""}`))
    .sort((a, b) => a.name.localeCompare(b.name));
  const unfiled = unfiledDocuments(project).length;

  return (
    <nav className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 px-4 py-4">
      <h2 className="mb-3 text-[17px] font-bold text-slate-900">Devices</h2>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-8" placeholder="Find a device..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!q && (
        <TreeLink to={docHref(project, OVERVIEW_ID)} active={current === OVERVIEW_ID} icon={<FileText className="h-4 w-4 text-slate-500" />}>
          Project overview
        </TreeLink>
      )}

      {devices.map(({ preset, units }) => {
        const Icon = categoryIcon(preset.category);
        return (
          <TreeLink key={preset.id} to={docHref(project, preset.id)} active={current === preset.id} icon={<Icon className="h-4 w-4 text-slate-500" />}>
            {preset.name}
            {units > 1 && <span className="ml-1 text-slate-500">(x{units})</span>}
          </TreeLink>
        );
      })}
      {devices.length === 0 && buses.length === 0 && <div className="px-2 py-1.5 text-slate-400">Nothing matches.</div>}

      {buses.length > 0 && (
        <>
          <div className="px-2 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Networks</div>
          {buses.map((bus) => (
            <TreeLink key={bus.id} to={docHref(project, bus.id)} active={current === bus.id} icon={<Share2 className="h-4 w-4" style={{ color: busColor(bus) }} />}>
              {bus.name}
            </TreeLink>
          ))}
        </>
      )}

      <div className="mt-auto border-t border-slate-200 pt-3">
        <TreeLink to={docHref(project, ALL_DOCUMENTS)} active={current === ALL_DOCUMENTS} icon={<FileText className="h-4 w-4 text-slate-500" />}>
          All documents <Count n={Object.keys(project.documents).length} />
        </TreeLink>
        <TreeLink to={docHref(project, UNFILED)} active={current === UNFILED} icon={<Folder className="h-4 w-4 text-slate-500" />}>
          Unfiled {unfiled > 0 && <Count n={unfiled} />}
        </TreeLink>
      </div>
    </nav>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-slate-500">({n})</span>;
}

function TreeLink({ to, active, icon, children }: { to: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-r border-l-[3px] py-1.5 pl-2 pr-2 ${
        active ? "border-brand bg-brand-wash font-medium text-slate-900" : "border-transparent text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}
