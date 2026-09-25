import { X } from "lucide-react";

// The inspector-side form for creating one record. Nothing is written until the submit
// button, so Cancel leaves the project as it was; the caller selects what was created.
export function CreatePane({
  title,
  submitLabel,
  ready,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  submitLabel: string;
  ready: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <h2 className="flex-1 text-[20px] font-bold text-slate-900">{title}</h2>
        <button onClick={onCancel} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit();
        }}
      >
        {children}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={!ready} className="rounded-md bg-brand px-3 py-1.5 font-semibold text-charcoal hover:bg-brand-hover disabled:opacity-50">
            {submitLabel}
          </button>
        </div>
      </form>
    </aside>
  );
}

// What the record will look like once created, in one line.
export function CreatePreview({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2">
      {icon}
      <span className="min-w-0">
        <span className="block text-[11px] text-slate-500">{label}</span>
        <span className="block truncate font-mono text-[12px] text-slate-800">{children}</span>
      </span>
    </div>
  );
}
