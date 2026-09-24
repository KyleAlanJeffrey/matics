import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, ChevronDown, ChevronRight, FileText, Plus, Trash2, X } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { assetSrc } from "@/lib/assets";
import { busColor, type CanFrame, type Project } from "@/model/types";
import { formatCanId, formatFrameRange, frameFlows, frameIdCount, parseCanId, partyLabel, partyOptions, partyPresetId, partyTotals, totalFrameIds, type PartyTotals } from "@/model/frames";
import { DbcImportButton } from "./DbcImport";
import { Tag } from "@/components/Badges";

const DOT = "\u00b7";
const UNASSIGNED = "unassigned";

type Mode = "definitions" | "by-device";

// Configuration of who sends which CAN identifiers and who consumes them. This is the
// expected allocation, not live traffic: nothing here is a message rate or a count of
// transmissions.
// Embedded in Communications, whose header carries the title and the add button.
export function FramesView({ embedded = false }: { embedded?: boolean }) {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const { addFrame } = useProjectStore();
  const [mode, setMode] = useState<Mode>("definitions");
  const [query, setQuery] = useState("");
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [busFilter, setBusFilter] = useState<string>("");

  const frames = useMemo(() => Object.values(project.frames), [project.frames]);
  const totals = useMemo(() => partyTotals(project), [project]);
  const knownBuses = (frame: CanFrame) => frame.busIds.filter((id) => project.buses[id]);
  const unassigned = frames.filter((f) => knownBuses(f).length === 0).length;
  const selectedFrame = selectedId ? project.frames[selectedId] : undefined;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const needleId = parseCanId(query);
    return frames.filter((frame) => {
      if (partyFilter && frame.senderId !== partyFilter && !frame.receiverIds.includes(partyFilter)) return false;
      if (busFilter === UNASSIGNED ? knownBuses(frame).length > 0 : busFilter && !frame.busIds.includes(busFilter)) return false;
      if (!needle) return true;
      if (frame.name.toLowerCase().includes(needle)) return true;
      if (needleId !== undefined && needleId >= frame.startId && needleId <= frame.endId) return true;
      return formatFrameRange(frame).toLowerCase().includes(needle);
    });
  }, [frames, query, partyFilter, busFilter, project.buses]);

  const createFrame = () => {
    const id = addFrame({ group: frames[frames.length - 1]?.group });
    select(id);
  };

  return (
    <div className="flex h-full text-[13px]">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-[15px] font-semibold">Frame library</span>
          <DbcImportButton />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <button
            onClick={() => {
              setPartyFilter("");
              setBusFilter("");
            }}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left ${!partyFilter && !busFilter ? "bg-brand-wash font-medium text-brand-ink" : "hover:bg-slate-50"}`}
          >
            <FileText className="h-4 w-4" />
            <span className="flex-1">All frames</span>
            <CountBadge active={!partyFilter && !busFilter}>{frames.length}</CountBadge>
          </button>
          <input className="input" placeholder="Find a frame or ID..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <SidebarSection title="By device" caption="Tx / Rx counts are IDs">
          {totals.length === 0 && <div className="px-3 py-1 text-slate-400">No frames yet.</div>}
          {totals.map((party) => (
            <button
              key={party.partyId}
              onClick={() => setPartyFilter(partyFilter === party.partyId ? "" : party.partyId)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${partyFilter === party.partyId ? "bg-brand-wash" : "hover:bg-slate-50"}`}
            >
              <PartyThumb project={project} partyId={party.partyId} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{partyLabel(project, party.partyId)}</span>
              <span className="shrink-0 text-[11px] text-slate-500">
                Tx {party.txIds} {DOT} Rx {party.rxIds}
              </span>
            </button>
          ))}
        </SidebarSection>

        <SidebarSection title="By network">
          {Object.values(project.buses)
            .filter((bus) => bus.kind === "can")
            .map((bus) => {
              const count = frames.filter((f) => f.busIds.includes(bus.id)).length;
              return (
                <button
                  key={bus.id}
                  onClick={() => setBusFilter(busFilter === bus.id ? "" : bus.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${busFilter === bus.id ? "bg-brand-wash" : "hover:bg-slate-50"}`}
                >
                  <Tag color={busColor(bus)} size="md">
                    {bus.tag ?? "B"}
                  </Tag>
                  <span className="flex-1 truncate font-medium text-slate-800">{bus.name}</span>
                  {count > 0 && <CountBadge>{count}</CountBadge>}
                </button>
              );
            })}
          <button
            onClick={() => setBusFilter(busFilter === UNASSIGNED ? "" : UNASSIGNED)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${busFilter === UNASSIGNED ? "bg-brand-wash" : "hover:bg-slate-50"}`}
          >
            <span className="inline-flex h-[22px] w-8 items-center justify-center rounded border border-slate-300 bg-slate-50 text-slate-400">-</span>
            <span className="flex-1 font-medium text-slate-600">Unassigned</span>
            <CountBadge>{unassigned}</CountBadge>
          </button>
        </SidebarSection>

        <div className="mt-auto p-3">
          <button onClick={createFrame} className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-brand-ink hover:bg-slate-50">
            <Plus className="h-4 w-4" /> Frame definition
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50/60">
        {!embedded && (
        <div className="flex items-start gap-4 px-6 pt-5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-slate-500">Communication schema</div>
            <h1 className="text-[30px] font-bold leading-tight text-slate-900">CAN frames</h1>
            <div className="mt-1 text-slate-500">Define who sends each frame and who consumes it.</div>
            <div className="mt-2 text-slate-600">
              {frames.length} definition{frames.length === 1 ? "" : "s"} {DOT} {totalFrameIds(frames)} CAN IDs
            </div>
          </div>
          <button onClick={createFrame} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 font-medium text-charcoal hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> Add frame
          </button>
        </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 px-6 pt-4">
          {embedded && (
            <div className="mr-auto text-slate-600">
              {frames.length} definition{frames.length === 1 ? "" : "s"} {DOT} {totalFrameIds(frames)} CAN IDs
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" style={{ width: "auto" }} value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)}>
              <option value="">All devices</option>
              {totals.map((party) => (
                <option key={party.partyId} value={party.partyId}>
                  {partyLabel(project, party.partyId)}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: "auto" }} value={busFilter} onChange={(e) => setBusFilter(e.target.value)}>
              <option value="">All buses</option>
              {Object.values(project.buses).map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.tag ? `${bus.tag} ${bus.name}` : bus.name}
                </option>
              ))}
              <option value={UNASSIGNED}>Unassigned</option>
            </select>
            <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white">
              {(["definitions", "by-device"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-brand text-charcoal" : "text-slate-600 hover:bg-slate-50"}`}>
                  {m === "definitions" ? "Definitions" : "By device"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {mode === "definitions" ? (
            <FrameTable project={project} frames={visible} selectedId={selectedId} onSelect={select} />
          ) : (
            <ByDevice project={project} totals={totals.filter((t) => !partyFilter || t.partyId === partyFilter)} selectedId={selectedId} onSelect={select} />
          )}
          <FlowPreview project={project} />
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-500">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">i</span>
            {unassigned > 0 ? `Bus assignment not set on ${unassigned} of ${frames.length} frames. Payload layouts are not tracked.` : "Every frame has a bus. Payload layouts are not tracked."}
          </div>
        </div>
      </div>

      {selectedFrame && <FrameEditor frame={selectedFrame} onClose={() => select(null)} />}
    </div>
  );
}

function FrameTable({ project, frames, selectedId, onSelect }: { project: Project; frames: CanFrame[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, CanFrame[]>();
    for (const frame of frames) {
      const key = frame.group?.trim() || "";
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key)!.push(frame);
    }
    return order.map((key) => ({ key, frames: byGroup.get(key)! }));
  }, [frames]);
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0].key !== "");

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[12px] text-slate-600">
            <th className="px-4 py-2 font-medium">Frame</th>
            <th className="px-3 py-2 font-medium">CAN ID / range</th>
            <th className="px-3 py-2 text-right font-medium">IDs</th>
            <th className="px-3 py-2 font-medium">Sender</th>
            <th className="px-3 py-2 font-medium">Receivers</th>
            <th className="px-3 py-2 font-medium">Bus</th>
          </tr>
        </thead>
        <tbody>
          {frames.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                No frames match. Add a frame definition to start allocating identifiers.
              </td>
            </tr>
          )}
          {groups.map((group) => (
            <GroupRows
              key={group.key || "(none)"}
              project={project}
              label={showGroups ? group.key || "Ungrouped" : null}
              frames={group.frames}
              collapsed={collapsed.has(group.key)}
              onToggle={() => toggle(group.key)}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  project,
  label,
  frames,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
}: {
  project: Project;
  label: string | null;
  frames: CanFrame[];
  collapsed: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { updateFrame } = useProjectStore();
  return (
    <>
      {label && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={6} className="px-3 py-1.5">
            <button onClick={onToggle} className="flex items-center gap-1 font-medium text-slate-700">
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {label} <span className="text-slate-400">({frames.length})</span>
            </button>
          </td>
        </tr>
      )}
      {!collapsed &&
        frames.map((frame) => {
          const selected = frame.id === selectedId;
          return (
            <tr key={frame.id} onClick={() => onSelect(frame.id)} className={`cursor-pointer border-b border-slate-100 last:border-b-0 ${selected ? "bg-brand-wash" : "hover:bg-slate-50"}`}>
              <td className={`px-4 py-2 font-medium ${selected ? "text-brand-ink" : "text-slate-800"}`}>{frame.name}</td>
              <td className="px-3 py-2 font-mono text-[12px] text-slate-700">{formatFrameRange(frame)}</td>
              <td className="px-3 py-2 text-right font-mono text-[12px] text-slate-700">{frameIdCount(frame)}</td>
              <td className="px-3 py-2">
                <PartyChip project={project} partyId={frame.senderId} />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  {frame.receiverIds.length === 0 && <span className="text-slate-400">No receivers</span>}
                  {frame.receiverIds.map((id) => (
                    <PartyChip key={id} project={project} partyId={id} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <BusPicker project={project} busIds={frame.busIds} onChange={(busIds) => updateFrame(frame.id, { busIds })} compact />
              </td>
            </tr>
          );
        })}
    </>
  );
}

// Each party with what it transmits and receives, the same definitions seen from the
// device's side.
function ByDevice({ project, totals, selectedId, onSelect }: { project: Project; totals: PartyTotals[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (totals.length === 0) return <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">No frames yet.</div>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {totals.map((party) => (
        <div key={party.partyId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
            <PartyThumb project={project} partyId={party.partyId} />
            <span className="font-semibold text-slate-800">{partyLabel(project, party.partyId)}</span>
            <span className="ml-auto text-[12px] text-slate-500">
              Tx {party.txIds} {DOT} Rx {party.rxIds} IDs
            </span>
          </div>
          <DirectionList project={project} title="Transmits" icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-brand-ink" />} frames={party.txFrames} other={(f) => f.receiverIds} selectedId={selectedId} onSelect={onSelect} />
          <DirectionList project={project} title="Receives" icon={<ArrowDownToLine className="h-3.5 w-3.5 text-teal-600" />} frames={party.rxFrames} other={(f) => [f.senderId]} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}

function DirectionList({
  project,
  title,
  icon,
  frames,
  other,
  selectedId,
  onSelect,
}: {
  project: Project;
  title: string;
  icon: React.ReactNode;
  frames: CanFrame[];
  other: (frame: CanFrame) => string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon} {title} <span className="font-normal normal-case text-slate-400">{frames.length === 0 ? "none" : `${frames.length} frame${frames.length === 1 ? "" : "s"}`}</span>
      </div>
      <div className="flex flex-col py-1">
        {frames.map((frame) => (
          <button key={frame.id} onClick={() => onSelect(frame.id)} className={`flex items-center gap-3 px-4 py-1 text-left ${frame.id === selectedId ? "bg-brand-wash text-brand-ink" : "hover:bg-slate-50"}`}>
            <span className="w-36 truncate font-medium">{frame.name}</span>
            <span className="w-32 font-mono text-[12px] text-slate-600">{formatFrameRange(frame)}</span>
            <span className="w-8 text-right font-mono text-[12px] text-slate-600">{frameIdCount(frame)}</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1 text-slate-600">
              {other(frame).map((id) => (
                <PartyChip key={id} project={project} partyId={id} />
              ))}
            </span>
            {frame.busIds.map((busId) => project.buses[busId] && <Tag key={busId} color={busColor(project.buses[busId])}>{project.buses[busId].tag ?? "B"}</Tag>)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Producer/consumer relationships between parties. These are logical flows, not the
// physical wires on the diagram; a pair with traffic both ways gets two arrows.
function FlowPreview({ project }: { project: Project }) {
  const flows = useMemo(() => frameFlows(project), [project]);
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    const result: { a: string; b: string; forward?: number; back?: number }[] = [];
    for (const flow of flows) {
      const key = [flow.fromId, flow.toId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const back = flows.find((f) => f.fromId === flow.toId && f.toId === flow.fromId);
      result.push({ a: flow.fromId, b: flow.toId, forward: flow.ids, back: back?.ids });
    }
    return result;
  }, [flows]);

  if (pairs.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 font-semibold text-slate-800">Logical frame flow</div>
      <div className="flex flex-wrap gap-6">
        {pairs.map((pair) => (
          <div key={`${pair.a}|${pair.b}`} className="flex items-center gap-3">
            <PartyCard project={project} partyId={pair.a} />
            <div className="flex w-32 flex-col gap-1 text-[12px] text-brand-ink">
              <div className="flex items-center gap-1">
                <span className="h-0.5 flex-1 bg-brand" />
                <ArrowRight className="-ml-2 h-4 w-4" />
              </div>
              <div className="-my-1 text-center font-medium">{pair.forward} ID{pair.forward === 1 ? "" : "s"}</div>
              {pair.back !== undefined && (
                <>
                  <div className="text-center font-medium">{pair.back} ID{pair.back === 1 ? "" : "s"}</div>
                  <div className="-mt-1 flex items-center gap-1">
                    <ArrowLeft className="-mr-2 h-4 w-4" />
                    <span className="h-0.5 flex-1 bg-brand" />
                  </div>
                </>
              )}
            </div>
            <PartyCard project={project} partyId={pair.b} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyCard({ project, partyId }: { project: Project; partyId: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <PartyThumb project={project} partyId={partyId} size="lg" />
      <span className="font-medium text-slate-800">{partyLabel(project, partyId)}</span>
    </div>
  );
}

function PartyChip({ project, partyId }: { project: Project; partyId: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 py-0.5 pl-0.5 pr-1.5 text-[12px] text-slate-700">
      <PartyThumb project={project} partyId={partyId} size="sm" />
      {partyLabel(project, partyId)}
    </span>
  );
}

function PartyThumb({ project, partyId, size = "md" }: { project: Project; partyId: string; size?: "sm" | "md" | "lg" }) {
  const preset = project.presets[partyPresetId(project, partyId) ?? ""];
  const src = assetSrc(preset?.imageUrl, useProjectDir());
  const box = size === "sm" ? "h-4 w-5" : size === "lg" ? "h-9 w-11" : "h-6 w-8";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 ${box}`}>
      {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
    </span>
  );
}

function FrameEditor({ frame, onClose }: { frame: CanFrame; onClose: () => void }) {
  const project = useProject();
  const { updateFrame, removeFrame } = useProjectStore();
  const isRange = frame.startId !== frame.endId;
  const [rangeMode, setRangeMode] = useState(isRange);
  // Re-derive the mode only when a different frame opens; while editing, the user's choice wins.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setRangeMode(frame.startId !== frame.endId), [frame.id]);
  const parties = partyOptions(project);
  const count = frameIdCount(frame);

  const setStart = (value: number) => updateFrame(frame.id, rangeMode ? { startId: value, endId: Math.max(value, frame.endId) } : { startId: value, endId: value });
  const setEnd = (value: number) => updateFrame(frame.id, { endId: Math.max(value, frame.startId) });
  const setMode = (range: boolean) => {
    setRangeMode(range);
    if (!range) updateFrame(frame.id, { endId: frame.startId });
  };

  return (
    <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-bold text-slate-900">{frame.name || "Untitled frame"}</div>
          <div className="text-slate-500">Frame definition</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <Field label="Name">
          <input className="input" value={frame.name} onChange={(e) => updateFrame(frame.id, { name: e.target.value })} />
        </Field>
        <Field label="Identifier mode">
          <select className="input" value={rangeMode ? "range" : "single"} onChange={(e) => setMode(e.target.value === "range")}>
            <option value="single">Single ID</option>
            <option value="range">Range</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={rangeMode ? "Start ID" : "CAN ID"}>
            <HexInput value={frame.startId} onCommit={setStart} />
          </Field>
          {rangeMode && (
            <Field label="End ID">
              <HexInput value={frame.endId} onCommit={setEnd} />
            </Field>
          )}
        </div>
        <div className="-mt-1 text-[12px] text-slate-500">
          {count} identifier{count === 1 ? "" : "s"} {rangeMode && `${DOT} inclusive`}
        </div>

        <Field label="Sender" icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-brand-ink" />}>
          <select className="input" value={frame.senderId} onChange={(e) => updateFrame(frame.id, { senderId: e.target.value })}>
            {!parties.some((p) => p.id === frame.senderId) && <option value={frame.senderId}>Unknown</option>}
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Receivers" icon={<ArrowDownToLine className="h-3.5 w-3.5 text-teal-600" />} group>
          <div className="flex flex-wrap gap-1">
            {frame.receiverIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-0.5 pl-1 pr-1">
                <PartyChip project={project} partyId={id} />
                <button onClick={() => updateFrame(frame.id, { receiverIds: frame.receiverIds.filter((r) => r !== id) })} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Remove receiver">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <select
            className="input mt-1 text-slate-500"
            value=""
            onChange={(e) => {
              if (e.target.value) updateFrame(frame.id, { receiverIds: [...frame.receiverIds, e.target.value] });
            }}
          >
            <option value="">+ Add receiver</option>
            {parties
              .filter((p) => !frame.receiverIds.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Buses" group>
          <BusPicker project={project} busIds={frame.busIds} onChange={(busIds) => updateFrame(frame.id, { busIds })} />
          <span className="text-[11px] text-slate-400">A frame forwarded by a gateway can be on several networks.</span>
        </Field>

        <Field label="Group">
          <input className="input" list="frame-groups" placeholder="e.g. Perception -> Controller" value={frame.group ?? ""} onChange={(e) => updateFrame(frame.id, { group: e.target.value || undefined })} />
          <datalist id="frame-groups">
            {Array.from(new Set(Object.values(project.frames).map((f) => f.group).filter(Boolean))).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>

        <Field label="Notes">
          <textarea className="input min-h-20" placeholder="Payload layout, timing, open questions..." value={frame.notes ?? ""} onChange={(e) => updateFrame(frame.id, { notes: e.target.value || undefined })} />
        </Field>

        <button
          onClick={() => {
            removeFrame(frame.id);
            onClose();
          }}
          className="mt-2 flex items-center justify-center gap-1 rounded border border-red-200 px-2 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove frame
        </button>
      </div>
    </aside>
  );
}

// The networks a frame travels on: one tag chip per bus, each removable, plus a select
// for the CAN buses not yet chosen.
function BusPicker({ project, busIds, onChange, compact = false }: { project: Project; busIds: string[]; onChange: (busIds: string[]) => void; compact?: boolean }) {
  const remaining = Object.values(project.buses).filter((b) => b.kind === "can" && !busIds.includes(b.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {busIds.map((busId) => {
        const bus = project.buses[busId];
        // A bus id from an imported or pasted project may no longer exist; keep it removable.
        return (
          <span key={busId} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-0.5 pl-1 pr-0.5" title={bus ? bus.name : "This bus no longer exists"}>
            {bus ? <Tag color={busColor(bus)}>{bus.tag ?? "B"}</Tag> : <Tag color="#94a3b8">?</Tag>}
            {!compact && <span className="text-[12px] text-slate-700">{bus ? bus.name : "Unknown bus"}</span>}
            <button onClick={() => onChange(busIds.filter((id) => id !== busId))} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Remove from this bus">
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      {remaining.length > 0 && (
        <select
          className={`input text-slate-500 ${compact ? "py-1" : ""}`}
          style={{ width: "auto" }}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...busIds, e.target.value]);
          }}
        >
          <option value="">{busIds.length === 0 ? (compact ? "Unassigned" : "Choose a CAN bus...") : "+ Add bus"}</option>
          {remaining.map((b) => (
            <option key={b.id} value={b.id}>
              {b.tag ? `${b.tag} ${b.name}` : b.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Hex identifier field that keeps what the user typed until it parses.
function HexInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(formatCanId(value));
  useEffect(() => {
    setDraft((current) => (parseCanId(current) === value ? current : formatCanId(value)));
  }, [value]);
  const parsed = parseCanId(draft);
  return (
    <input
      className={`input font-mono ${parsed === undefined ? "border-red-300" : ""}`}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = parseCanId(e.target.value);
        if (next !== undefined && next !== value) onCommit(next);
      }}
      onBlur={() => setDraft(formatCanId(value))}
    />
  );
}

// A label around a group of controls clicks the first of them (a remove button) when its
// text is clicked, so groups get a plain heading instead.
function Field({ label, icon, group = false, children }: { label: string; icon?: React.ReactNode; group?: boolean; children: React.ReactNode }) {
  const heading = (
    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
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

function SidebarSection({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 pb-2">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
        <span className="font-semibold text-slate-800">{title}</span>
        {caption && <span className="text-[10px] text-slate-400">{caption}</span>}
      </div>
      {children}
    </div>
  );
}

function CountBadge({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-brand text-charcoal" : "bg-slate-100 text-slate-600"}`}>{children}</span>;
}
