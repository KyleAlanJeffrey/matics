export interface MessageTableRow {
  key: string;
  icon: React.ReactNode;
  name: string;
  meta?: string;
  badge?: string;
  from?: string;
  fromDetail?: string;
  to: string[];
  toDetail?: string;
  transport?: string;
  selected?: boolean;
  onClick: () => void;
}

export function MessageTable({ rows, empty }: { rows: MessageTableRow[]; empty: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.7fr)] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[12px] font-semibold text-slate-600">
        <span>Message</span>
        <span>From {"\u2192"} To</span>
        <span>Transport</span>
      </div>
      {rows.length === 0 && <div className="px-4 py-6 text-center text-slate-500">{empty}</div>}
      {rows.map((row) => (
        <button
          key={row.key}
          onClick={row.onClick}
          className={`grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.7fr)] items-center border-b border-l-[3px] border-b-slate-100 px-4 py-2.5 text-left last:border-b-0 ${
            row.selected ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {row.icon}
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">{row.name}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                {row.meta && <span className="truncate font-mono">{row.meta}</span>}
                {row.badge && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-600">{row.badge}</span>}
              </span>
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-slate-800">
              {row.from ?? <span className="text-slate-400">Sender not set</span>} {"\u2192"} {row.to.length ? row.to.join(", ") : <span className="text-slate-400">Receiver not set</span>}
            </span>
            {(row.fromDetail || row.toDetail) && <span className="block truncate text-[11.5px] text-slate-500">{[row.fromDetail, row.toDetail].filter(Boolean).join(" \u2192 ")}</span>}
          </span>
          <span className={`truncate ${row.transport ? "text-slate-800" : "text-slate-400"}`}>{row.transport ?? "Not set"}</span>
        </button>
      ))}
    </div>
  );
}
