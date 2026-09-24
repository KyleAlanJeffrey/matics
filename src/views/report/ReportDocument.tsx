import { Fragment } from "react";
import type { NoteLine, ReportData } from "@/model/report";
import { PORT_COLORS, PORT_KIND_LABELS, PORT_KINDS, type Project } from "@/model/types";
import { Tag } from "@/components/Badges";
import { SchematicSnapshot } from "./SchematicSnapshot";

// Laid out at a fixed width so the PDF pages come out at the same scale as the preview.
export const REPORT_WIDTH = 900;
const DOT = "\u00b7";

interface Props {
  ref: React.Ref<HTMLDivElement>;
  project: Project;
  report: ReportData;
  generatedAt: Date;
  onSchematicReady: () => void;
}

// Rows carry data-keep and headings data-keep-with-next; the PDF export uses them to
// place page breaks between rows, never through one or right after a heading.
export function ReportDocument({ ref, project, report, generatedAt, onSchematicReady }: Props) {
  const { summary } = report;
  const usedKinds = PORT_KINDS.filter((kind) => report.connections.some((c) => c.kind === PORT_KIND_LABELS[kind]) || report.networks.some((n) => n.family === PORT_KIND_LABELS[kind]));
  let section = 0;
  const heading = (title: string) => {
    section += 1;
    return (
      <h2 data-keep-with-next className="mb-3 mt-10 border-b-2 border-slate-800 pb-1 text-[19px] font-bold tracking-tight text-slate-900">
        <span className="mr-2 text-slate-400">{section}.</span>
        {title}
      </h2>
    );
  };

  return (
    <div ref={ref} className="bg-white px-12 pb-14 pt-12 text-[12.5px] leading-relaxed text-slate-800" style={{ width: REPORT_WIDTH }}>
      <header data-keep>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink">Network documentation</div>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight text-slate-900">{project.name}</h1>
        {project.description && <p className="mt-1 text-[15px] text-slate-600">{project.description}</p>}
        <p className="mt-2 text-[12px] text-slate-500">
          Generated {generatedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} {DOT} {generatedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
        <dl className="mt-6 grid grid-cols-6 overflow-hidden rounded-lg border border-slate-200">
          <Stat label="Devices" value={summary.devices} />
          <Stat label="Products" value={summary.products} />
          <Stat label="Networks" value={summary.networks} />
          <Stat label="Connections" value={summary.connections} />
          <Stat label="Zones" value={summary.zones} />
          <Stat label="CAN frames" value={summary.frames} />
        </dl>
      </header>

      {heading("Schematic")}
      <figure data-keep>
        <SchematicSnapshot project={project} width={REPORT_WIDTH - 96} onReady={onSchematicReady} />
        {usedKinds.length > 0 && (
          <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Wire colors</span>
            {usedKinds.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-5 rounded" style={{ background: PORT_COLORS[kind] }} />
                {PORT_KIND_LABELS[kind]}
              </span>
            ))}
            <span className="text-slate-500">Buses use their own color; see Networks.</span>
          </figcaption>
        )}
      </figure>

      {heading("Parts list")}
      <Table head={["Product", "Manufacturer and model", "Category", "Qty", "Ports"]} widths={["22%", "22%", "13%", "7%", "36%"]} empty="No products placed.">
        {report.products.map((row) => (
          <tr key={row.id} data-keep>
            <Td strong>{row.name}</Td>
            <Td>{row.maker}</Td>
            <Td>{row.category}</Td>
            <Td numeric>{row.qty}</Td>
            <Td muted>{row.ports}</Td>
          </tr>
        ))}
      </Table>

      {heading("Devices")}
      <Table head={["Device", "Product", "Zone", "Qty", "Properties"]} widths={["22%", "22%", "15%", "7%", "34%"]} empty="No devices placed.">
        {report.devices.map((row) => (
          <tr key={row.id} data-keep>
            <Td strong>{row.name}</Td>
            <Td>
              {row.product}
              {row.maker && <div className="text-[11px] text-slate-500">{row.maker}</div>}
            </Td>
            <Td>{row.zone || <span className="text-slate-400">None</span>}</Td>
            <Td numeric>{row.qty}</Td>
            <Td>
              {row.props.length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-x-2">
                  {row.props.map(([key, value]) => (
                    <Fragment key={key}>
                      <span className="text-slate-500">{key}</span>
                      <span className="break-all">{value}</span>
                    </Fragment>
                  ))}
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      {heading("Networks")}
      <Table head={["Tag", "Network", "Family", "Variant", "Rate", "Members"]} widths={["8%", "18%", "11%", "13%", "12%", "38%"]} empty="No shared networks.">
        {report.networks.map((row) => (
          <tr key={row.id} data-keep>
            <Td>{row.tag ? <Tag color={row.color || PORT_COLORS[kindOf(row.family)]} size="md">{row.tag}</Tag> : ""}</Td>
            <Td strong>{row.name}</Td>
            <Td>{row.family}</Td>
            <Td>{row.variant || <span className="text-slate-400">Not confirmed</span>}</Td>
            <Td>{row.rate}</Td>
            <Td muted>{row.members.join(", ") || "No members"}</Td>
          </tr>
        ))}
      </Table>

      {heading("Connections")}
      <Table head={["From", "To", "Type", "Lines", "Label"]} widths={["31%", "31%", "12%", "8%", "18%"]} empty="No wires yet.">
        {report.connections.map((row) => (
          <tr key={row.id} data-keep>
            <Td>{row.from}</Td>
            <Td>{row.to}</Td>
            <Td>{row.kind}</Td>
            <Td numeric>{row.lines}</Td>
            <Td muted>{row.label}</Td>
          </tr>
        ))}
      </Table>

      {report.frames.length > 0 && (
        <>
          {heading("CAN frames")}
          <Table head={["ID", "Frame", "Sender", "Receivers", "Networks"]} widths={["17%", "22%", "19%", "30%", "12%"]} empty="">
            {report.frames.map((row) => (
              <tr key={row.id} data-keep>
                <Td mono>{row.ids}</Td>
                <Td strong>{row.name}</Td>
                <Td>{row.sender}</Td>
                <Td>{row.receivers}</Td>
                <Td>{row.networks}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {report.documents.length > 0 && (
        <>
          {heading("Documents")}
          <Table head={["Document", "Kind", "Linked to", "Source"]} widths={["30%", "9%", "28%", "33%"]} empty="">
            {report.documents.map((row) => (
              <tr key={row.id} data-keep>
                <Td strong>{row.title}</Td>
                <Td>{row.kind}</Td>
                <Td>{row.linkedTo}</Td>
                <Td muted>
                  <span className="break-all">{row.source}</span>
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {report.notes.length > 0 && (
        <>
          {heading("Notes")}
          {report.notes.map((note) => (
            <section key={note.entityId} className="mb-5">
              <h3 data-keep-with-next className="mb-1 text-[14px] font-semibold text-slate-900">
                {note.title}
              </h3>
              {numberLines(note.lines).map(({ line, number }, index) => (
                <NoteLineView key={index} line={line} number={number} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function kindOf(familyLabel: string) {
  return PORT_KINDS.find((kind) => PORT_KIND_LABELS[kind] === familyLabel) ?? "digital-out";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-slate-200 px-3 py-2.5 last:border-r-0">
      <dd className="text-[22px] font-bold tabular-nums leading-none text-slate-900">{value}</dd>
      <dt className="mt-1 text-[11px] text-slate-500">{label}</dt>
    </div>
  );
}

function Table({ head, widths, empty, children }: { head: string[]; widths: string[]; empty: string; children: React.ReactNode[] }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        {widths.map((width, i) => (
          <col key={i} style={{ width }} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
          {head.map((label) => (
            <th key={label} className="px-2 py-1.5 font-semibold">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {children.length > 0 ? (
          children
        ) : (
          <tr data-keep>
            <td colSpan={head.length} className="px-2 py-3 text-slate-400">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Td({ children, strong, muted, numeric, mono }: { children: React.ReactNode; strong?: boolean; muted?: boolean; numeric?: boolean; mono?: boolean }) {
  const tone = strong ? "font-semibold text-slate-900" : muted ? "text-slate-600" : "";
  return <td className={`break-words border-b border-slate-200 px-2 py-1.5 align-top ${tone} ${numeric ? "text-right tabular-nums" : ""} ${mono ? "font-mono text-[11.5px]" : ""}`}>{children}</td>;
}

// Numbered items count up within a run at the same depth, like the editor shows them.
function numberLines(lines: NoteLine[]) {
  const counters: number[] = [];
  return lines.map((line) => {
    counters.length = line.depth + 1;
    if (line.kind !== "numbered") {
      counters[line.depth] = 0;
      return { line, number: 0 };
    }
    counters[line.depth] = (counters[line.depth] ?? 0) + 1;
    return { line, number: counters[line.depth] };
  });
}

function NoteLineView({ line, number }: { line: NoteLine; number: number }) {
  const indent = { paddingLeft: line.depth * 18 };
  if (line.kind === "heading") {
    return (
      <div data-keep-with-next className={`mt-2 font-semibold text-slate-900 ${line.level === 1 ? "text-[13.5px]" : "text-[12.5px]"}`} style={indent}>
        {line.text}
      </div>
    );
  }
  if (line.kind === "code") {
    return (
      <pre data-keep className="my-1 whitespace-pre-wrap rounded bg-slate-100 px-2 py-1 font-mono text-[11px]" style={indent}>
        {line.text}
      </pre>
    );
  }
  const marker = line.kind === "bullet" ? "-" : line.kind === "numbered" ? `${number}.` : null;
  return (
    <div data-keep className="flex gap-2 py-0.5" style={indent}>
      {marker && <span className="w-6 shrink-0 text-right text-slate-400">{marker}</span>}
      {line.kind === "check" && (
        <span className="flex w-6 shrink-0 justify-end pt-[3px]">
          <span className={`flex h-3 w-3 items-center justify-center rounded-sm border text-[9px] leading-none ${line.checked ? "border-slate-500 bg-slate-500 text-white" : "border-slate-400"}`}>{line.checked ? "x" : ""}</span>
        </span>
      )}
      <span>{line.text}</span>
    </div>
  );
}
