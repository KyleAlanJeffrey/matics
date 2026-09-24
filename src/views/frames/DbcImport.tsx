import { useMemo, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import type { CanFrame } from "@/model/types";
import { dbcNodes, matchNode, parseDbc, type DbcFile } from "@/model/dbc";
import { partyOptions } from "@/model/frames";

// Reads a Vector DBC file into frame definitions. The file's nodes are matched to the
// project's devices by name; the user corrects the guesses before anything is added.
export function DbcImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ fileName: string; file: DbcFile } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    const parsed = parseDbc(await file.text());
    if (parsed.messages.length === 0) {
      setError(`${file.name} has no BO_ message definitions.`);
      return;
    }
    setPending({ fileName: file.name, file: parsed });
  };

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-brand-ink hover:bg-brand-wash"
        title="Add frame definitions from a Vector DBC file"
      >
        <FileUp className="h-3.5 w-3.5" /> Import DBC
      </button>
      <input
        ref={input}
        type="file"
        accept=".dbc,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          e.target.value = "";
        }}
      />
      {error && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded border border-red-200 bg-white px-3 py-2 text-[12px] text-red-700 shadow">
          {error}
          <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-red-50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {pending && <DbcImportDialog fileName={pending.fileName} file={pending.file} onClose={() => setPending(null)} />}
    </>
  );
}

const SKIP = "";

function DbcImportDialog({ fileName, file, onClose }: { fileName: string; file: DbcFile; onClose: () => void }) {
  const project = useProject();
  const { addFrames } = useProjectStore();
  const { select } = useSelection();
  const parties = useMemo(() => partyOptions(project), [project]);
  const nodes = useMemo(() => dbcNodes(file), [file]);
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(nodes.map((node) => [node, matchNode(node, parties) ?? SKIP])));
  const [busId, setBusId] = useState(Object.keys(project.buses)[0] ?? "");
  const [group, setGroup] = useState(fileName.replace(/\.dbc$/i, ""));

  const frames = useMemo(() => {
    const out: Omit<CanFrame, "id">[] = [];
    let skipped = 0;
    for (const message of file.messages) {
      const senders = message.transmitters.map((n) => mapping[n]).filter(Boolean);
      if (senders.length === 0) {
        skipped++;
        continue;
      }
      const receiverIds = Array.from(new Set(message.receivers.map((n) => mapping[n]).filter((id) => id && !senders.includes(id))));
      // A message with several transmitters becomes one frame per sender.
      for (const senderId of new Set(senders)) {
        out.push({
          name: message.name,
          startId: message.id,
          endId: message.id,
          senderId,
          receiverIds,
          busIds: busId ? [busId] : [],
          group: group.trim() || undefined,
          notes: message.comment,
        });
      }
    }
    return { out, skipped };
  }, [file, mapping, busId, group]);

  const importFrames = () => {
    const ids = addFrames(frames.out);
    onClose();
    if (ids[0]) select(ids[0]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6" onClick={onClose}>
      <div className="flex max-h-full w-[560px] flex-col rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="font-semibold">Import frames from {fileName}</div>
            <div className="text-[12px] text-slate-500">
              {file.messages.length} messages, {nodes.length} nodes. Match each node to a device; messages whose sender is not matched are skipped.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-[13px]">
          <table className="w-full">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-1 font-medium">DBC node</th>
                <th className="pb-1 font-medium">Device in this project</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node} className="border-t border-slate-100">
                  <td className="py-1.5 font-mono text-[12px]">{node}</td>
                  <td className="py-1.5">
                    <select className="input" value={mapping[node] ?? SKIP} onChange={(e) => setMapping({ ...mapping, [node]: e.target.value })}>
                      <option value={SKIP}>Not in this project</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-700">Bus</span>
              <select className="input" value={busId} onChange={(e) => setBusId(e.target.value)}>
                <option value="">Unassigned</option>
                {Object.values(project.buses).map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.tag ? `${bus.tag} ${bus.name}` : bus.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-700">Group</span>
              <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Optional" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <div className="text-[12px] text-slate-500">
            {frames.out.length} frame{frames.out.length === 1 ? "" : "s"} will be added
            {frames.skipped > 0 ? `, ${frames.skipped} skipped (sender not matched)` : ""}.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={importFrames} disabled={frames.out.length === 0} className="rounded bg-brand px-3 py-1.5 font-medium text-charcoal hover:bg-brand-hover disabled:opacity-40">
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
