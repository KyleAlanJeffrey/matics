import { useRef, useState } from "react";
import { FileUp, Info } from "lucide-react";
import { useProjectStore } from "@/store/project-store";
import { parseProto } from "@/model/proto";

export function ProtoImportButton({ onImported, subtle = false }: { onImported?: () => void; subtle?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const importMessages = useProjectStore((s) => s.importMessages);
  const [notice, setNotice] = useState<string | null>(null);

  const read = async (files: FileList) => {
    const lines: string[] = [];
    let total = 0;
    for (const file of Array.from(files)) {
      try {
        const schema = parseProto(await file.text());
        if (schema.messages.length === 0) {
          lines.push(`${file.name}: no message definitions.`);
          continue;
        }
        const result = importMessages(schema.messages.map((m) => ({ name: m.name, fields: m.fields, schemaFile: file.name, package: schema.package, version: schema.version })));
        total += result.added + result.updated;
        lines.push(`${file.name}: ${result.added} added${result.updated ? `, ${result.updated} updated` : ""}.`);
      } catch (error) {
        lines.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setNotice(lines.join(" "));
    if (total > 0) onImported?.();
  };

  return (
    <div className="relative">
      <button
        onClick={() => input.current?.click()}
        className={subtle ? "flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash" : "flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50"}
        title="Add message definitions from .proto files"
      >
        <FileUp className="h-4 w-4" /> Import .proto
      </button>
      <input
        ref={input}
        type="file"
        accept=".proto"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void read(e.target.files);
          e.target.value = "";
        }}
      />
      {notice && (
        <div className="absolute right-0 top-full z-40 mt-1 flex w-80 items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-[12px] text-slate-700 shadow-lg">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
