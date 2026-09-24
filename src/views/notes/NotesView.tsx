import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { FileUp, Maximize2, Minimize2, Plus, Search } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { isDesktop } from "@/lib/desktop";
import { useAttachFile } from "@/components/DocumentLinks";
import { instancesOf, noteKeyFor } from "@/model/derived";
import { ALL_DOCUMENTS, OVERVIEW_ID, UNFILED, documentOwners, isOwner, ownerKeyFor, searchDocumentation } from "@/model/documentation";
import { isService } from "@/model/services";
import type { Project } from "@/model/types";
import { BrowseTree } from "./BrowseTree";
import { OwnerPane } from "./OwnerPane";
import { DocumentReader } from "./NotePage";

// Where the Documentation workspace opens: /notes/<owner>?doc=<document>. An owner is a
// product or network, or one of the special lists (overview, all, unfiled). The schematic
// selection rides along as ?selected= so switching views keeps it.
export function docHref(project: Project, owner: string, doc?: string) {
  const params = new URLSearchParams();
  if (doc && doc !== owner) params.set("doc", doc);
  const selected = project.presets[owner] ? instancesOf(project, owner)[0] : project.buses[owner] ? owner : undefined;
  if (selected) params.set("selected", selected);
  const query = params.toString();
  return `/notes/${owner}${query ? `?${query}` : ""}`;
}

function isSpecial(id: string) {
  return id === OVERVIEW_ID || id === ALL_DOCUMENTS || id === UNFILED;
}

export function NotesView() {
  const { entityId } = useParams<{ entityId: string }>();
  const [params] = useSearchParams();
  const project = useProject();
  const [focus, setFocus] = useState(false);

  // Links into the workspace may name a placed device, a document or a schematic selection.
  const target = entityId ?? params.get("selected") ?? undefined;
  if (!target || (!isSpecial(target) && !isOwner(project, target))) {
    const resolved = target ? resolveTarget(project, target) : null;
    if (resolved) return <Navigate to={docHref(project, resolved.owner, resolved.doc)} replace />;
    const first = Object.keys(project.presets)[0] ?? Object.keys(project.buses)[0] ?? OVERVIEW_ID;
    return <Navigate to={docHref(project, first)} replace />;
  }

  const owner = target;
  const doc = params.get("doc") ?? (owner === OVERVIEW_ID || !isSpecial(owner) ? owner : null);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
        <DocumentationSearch />
        {isDesktop() && <AttachFileButton owner={owner} />}
        <NewDocumentButton owner={owner} />
      </div>
      <div className="flex min-h-0 flex-1">
        {!focus && <BrowseTree current={owner} />}
        {/* Keyed so a pane's tab and half-filled forms never carry over to another owner. */}
        {!focus && <OwnerPane key={owner} owner={owner} current={doc} />}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <button
            onClick={() => setFocus((f) => !f)}
            className="absolute right-4 top-3 z-10 rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            title={focus ? "Show the browser and document list" : "Focus on this document"}
          >
            {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          {doc ? <DocumentReader key={doc} owner={owner} docId={doc} /> : <div className="flex flex-1 items-center justify-center text-slate-500">Pick a document from the list.</div>}
        </div>
      </div>
    </div>
  );
}

function resolveTarget(project: Project, id: string): { owner: string; doc?: string } | null {
  if (project.documents[id]) return { owner: documentOwners(project, id)[0] ?? ALL_DOCUMENTS, doc: id };
  if (isService(project, id)) return { owner: ownerKeyFor(project, id), doc: id };
  const key = noteKeyFor(project, id);
  if (isOwner(project, key)) return { owner: key };
  return null;
}

// On a device or network page the file is linked there; anywhere else it is unfiled.
function AttachFileButton({ owner }: { owner: string }) {
  const project = useProject();
  const attachFile = useAttachFile();
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        const linkTo = isOwner(project, owner) ? owner : null;
        const id = await attachFile(linkTo);
        if (id) navigate(docHref(project, linkTo ?? UNFILED, id));
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50"
      title="Copy a PDF or other file into the project folder"
    >
      <FileUp className="h-4 w-4" /> Attach PDF or file
    </button>
  );
}

function NewDocumentButton({ owner }: { owner: string }) {
  const project = useProject();
  const addDocumentLink = useProjectStore((s) => s.addDocumentLink);
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        const linkTo = isOwner(project, owner) ? owner : null;
        const id = addDocumentLink(linkTo, { title: "Untitled note", kind: "note" });
        navigate(docHref(project, linkTo ?? UNFILED, id));
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand px-4 py-2 font-semibold text-charcoal hover:bg-brand-hover"
    >
      <Plus className="h-4 w-4" /> New document
    </button>
  );
}

function DocumentationSearch() {
  const project = useProject();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = searchDocumentation(project, query);

  // Cmd/Ctrl+K jumps to search, as the hint says.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    navigate(docHref(project, hit.owner, hit.doc));
    setOpen(false);
    setQuery("");
    input.current?.blur();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        className="input !py-2 !pl-9 !pr-14 !text-[14px]"
        placeholder="Search notes, datasheets, devices, services and frame IDs..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter") go(active);
          else if (e.key === "Escape") input.current?.blur();
          else return;
          e.preventDefault();
        }}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 font-mono text-[11px] text-slate-400">Cmd K</kbd>
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {hits.length === 0 && <div className="px-3 py-2 text-slate-500">Nothing matches "{query.trim()}".</div>}
          {hits.map((hit, i) => (
            <button
              key={`${hit.kind}:${hit.owner}:${hit.doc ?? ""}:${hit.label}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded px-3 py-1.5 text-left ${i === active ? "bg-brand-wash" : ""}`}
            >
              <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{hit.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{hit.label}</span>
                {hit.detail && <span className={`block truncate text-[12px] text-slate-500 ${hit.kind === "Frame" ? "font-mono" : ""}`}>{hit.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
