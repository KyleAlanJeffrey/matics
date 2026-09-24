import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { FileImage, FileText, Image, Loader2 } from "lucide-react";
import { useProject } from "@/store/project-store";
import { buildReport } from "@/model/report";
import { safeFilename } from "@/store/persistence";
import { exportElementPdf, exportElementPng } from "@/lib/export-image";
import { ReportDocument } from "./ReportDocument";

type Job = "pdf" | "png" | "schematic";

export function ReportView() {
  const project = useProject();
  const report = useMemo(() => buildReport(project), [project]);
  const documentRef = useRef<HTMLDivElement>(null);
  const [schematicReady, setSchematicReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const generatedAt = useMemo(() => new Date(), []);

  const run = useCallback(
    async (job: Job) => {
      const root = documentRef.current;
      if (!root || busy) return;
      setError(null);
      const base = safeFilename(project.name);
      try {
        if (job === "pdf") {
          setBusy("Preparing PDF...");
          await exportElementPdf(root, `${base}-report.pdf`, `${project.name} - network documentation`, (page, total) => setBusy(`Rendering page ${page} of ${total}...`));
        } else if (job === "png") {
          setBusy("Rendering PNG...");
          await exportElementPng(root, `${base}-report.png`);
        } else {
          const figure = root.querySelector<HTMLElement>("[data-schematic]");
          if (!figure) throw new Error("The schematic is not on the page.");
          setBusy("Rendering schematic...");
          await exportElementPng(figure, `${base}-schematic.png`, 3);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [busy, project.name],
  );

  // File menu entries land here with ?download=...; the export starts once the schematic
  // has drawn its wires, and the parameter is dropped so a reload does not export again.
  const requested = params.get("download") as Job | null;
  useEffect(() => {
    if (!requested || !schematicReady) return;
    navigate("/report", { replace: true });
    void run(requested);
  }, [requested, schematicReady, navigate, run]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="font-semibold">Report</div>
        <div className="text-slate-500">A printable summary of this diagram for documentation.</div>
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {busy}
            </span>
          )}
          {error && <span className="text-red-700">{error}</span>}
          <ExportButton onClick={() => void run("schematic")} disabled={!!busy || !schematicReady} icon={Image} title="Only the schematic, at high resolution">
            Schematic PNG
          </ExportButton>
          <ExportButton onClick={() => void run("png")} disabled={!!busy || !schematicReady} icon={FileImage} title="The whole report as one tall picture">
            PNG
          </ExportButton>
          <ExportButton onClick={() => void run("pdf")} disabled={!!busy || !schematicReady} icon={FileText} title="A4 pages" primary>
            Download PDF
          </ExportButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 px-6 py-8">
        <div className="mx-auto w-fit shadow-lg">
          <ReportDocument ref={documentRef} project={project} report={report} generatedAt={generatedAt} onSchematicReady={() => setSchematicReady(true)} />
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  onClick,
  disabled,
  icon: Icon,
  title,
  primary,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 rounded px-3 py-1.5 disabled:opacity-40 ${primary ? "bg-brand font-medium text-charcoal hover:bg-brand-hover" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}
