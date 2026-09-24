import { useState } from "react";
import { useSearchParams } from "react-router";
import { FileCode2, Network, Plus } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { communicationRows, type CommunicationRow } from "@/model/messages";
import { FramesView } from "@/views/frames/FramesView";
import { ProtobufView } from "./ProtobufView";
import { MessageTable } from "./MessageTable";
import { ProtoImportButton } from "./ProtoImportButton";

const TABS = ["all", "can", "protobuf"] as const;
type Tab = (typeof TABS)[number];

// Messages exchanged between devices and services. CAN frame definitions and Protobuf
// messages each keep their own fields; "All" lists both side by side.
export function CommunicationsView() {
  const project = useProject();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "all";
  const { select } = useSelection();
  const { addMessage, addFrame } = useProjectStore();
  const frameCount = Object.keys(project.frames).length;
  const messageCount = Object.keys(project.messages).length;

  const setTab = (next: Tab, selected?: string) =>
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

  const add = () => {
    if (tab === "can") {
      select(addFrame({}));
      return;
    }
    setTab("protobuf", addMessage());
  };

  return (
    <div className="flex h-full flex-col bg-white text-[13px]">
      <div className="border-b border-slate-200 px-6 pt-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold leading-tight text-slate-900">Communications</h1>
            <div className="mt-0.5 text-slate-500">Messages exchanged between devices and services</div>
          </div>
          <ProtoImportButton onImported={() => setTab("protobuf")} />
          <button onClick={add} className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 font-semibold text-charcoal hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> {tab === "can" ? "Add frame" : "Add message"}
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
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "can" && <FramesView embedded />}
        {tab === "protobuf" && <ProtobufView />}
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
  const needle = query.trim().toLowerCase();
  const rows = communicationRows(project).filter(
    (row) => !needle || [row.name, row.meta, row.from, ...row.to, row.transport].some((text) => text?.toLowerCase().includes(needle)),
  );

  return (
    <div className="h-full overflow-y-auto bg-slate-50/60 p-6">
      <input className="input mb-3 max-w-md" placeholder="Search messages, devices or transports..." value={query} onChange={(e) => setQuery(e.target.value)} />
      <MessageTable
        rows={rows.map((row) => ({
          key: `${row.kind}:${row.id}`,
          icon: row.kind === "can" ? <Network className="h-4 w-4 text-[#713bc4]" /> : <FileCode2 className="h-4 w-4 text-brand-ink" />,
          name: row.name,
          meta: row.meta,
          badge: row.kind === "can" ? "CAN" : "Protobuf",
          from: row.from,
          to: row.to,
          transport: row.transport,
          onClick: () => onOpen(row),
        }))}
        empty="No CAN frames or Protobuf messages yet."
      />
      <div className="mt-2 text-[12px] text-slate-500">
        {rows.length} message{rows.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
