import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink, FileUp, Globe, Link2, Plus, X } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { desktop, isDesktop } from "@/lib/desktop";
import { documentsFor } from "@/model/derived";
import type { DocumentKind } from "@/model/types";

const KIND_LABELS: Record<DocumentKind, string> = { pdf: "Datasheet / PDF", guide: "Guide / web page", note: "Note" };

const BADGE: Record<DocumentKind, { text: string; className: string }> = {
  pdf: { text: "PDF", className: "bg-red-500 text-white" },
  guide: { text: "GUIDE", className: "bg-slate-700 text-white" },
  note: { text: "NOTE", className: "bg-slate-200 text-slate-700" },
};

// Square kind badge used wherever a document is listed.
export function DocumentBadge({ kind, size = "md" }: { kind: DocumentKind; size?: "sm" | "md" }) {
  const badge = BADGE[kind];
  const dims = size === "sm" ? "h-6 w-6 text-[7px]" : "h-8 w-8 text-[8px]";
  return <span className={`flex ${dims} shrink-0 items-center justify-center rounded font-bold tracking-wide ${badge.className}`}>{badge.text}</span>;
}

// Copies a picked file into the project as a document linked to owner, or unfiled when
// owner is null. Resolves to the new document's id, or null when nothing was attached.
export function useAttachFile() {
  const addDocumentLink = useProjectStore((s) => s.addDocumentLink);
  const pickAsset = useProjectStore((s) => s.pickAsset);
  return async (owner: string | null) => {
    try {
      const picked = await pickAsset("document");
      if (!picked) return null;
      const ext = picked.name.split(".").pop()?.toLowerCase() ?? "";
      return addDocumentLink(owner, { title: picked.name.replace(/\.[^.]+$/, ""), file: picked.rel, kind: ext === "pdf" ? "pdf" : "note" });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not copy that file into the project.");
      return null;
    }
  };
}

// Documents attached to a product, bus or device, plus the product's own page.
// Shared by the diagram inspector and the documentation view.
export function DocumentLinks({ entityId, compact = false, readOnly = false }: { entityId: string; compact?: boolean; readOnly?: boolean }) {
  const project = useProject();
  const { addDocumentLink, unlinkDocument, updatePreset } = useProjectStore();
  const attachFile = useAttachFile();
  const projectDir = useProjectDir();
  const preset = project.presets[entityId];
  const docs = documentsFor(project, entityId);
  const [adding, setAdding] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {preset && (
        <div className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5">
          <Globe className="h-4 w-4 shrink-0 text-slate-500" />
          {editingProduct && !readOnly ? (
            <UrlForm
              initial={preset.productUrl ?? ""}
              placeholder="https://manufacturer.com/product"
              onCancel={() => setEditingProduct(false)}
              onSave={(url) => {
                updatePreset(preset.id, { productUrl: url || undefined });
                setEditingProduct(false);
              }}
            />
          ) : preset.productUrl ? (
            <>
              <a href={preset.productUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand-ink hover:underline" title={preset.productUrl}>
                Product page
              </a>
              {!readOnly && (
                <button className="text-[11px] text-slate-500 hover:underline" onClick={() => setEditingProduct(true)}>
                  Edit
                </button>
              )}
              <a href={preset.productUrl} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-ink" title="Open product page">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          ) : readOnly ? (
            <span className="flex-1 text-slate-400">No product page</span>
          ) : (
            <button className="flex flex-1 items-center gap-1 text-left text-slate-500 hover:text-brand-ink" onClick={() => setEditingProduct(true)}>
              <Plus className="h-3.5 w-3.5" /> Add product page
            </button>
          )}
        </div>
      )}

      {docs.length === 0 && !adding && <div className="px-1 text-slate-400">No documents linked yet.</div>}
      {docs.map((doc) => {
        return (
          <div key={doc.id} className="group flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 hover:bg-slate-50">
            <DocumentBadge kind={doc.kind} size={compact ? "sm" : "md"} />
            <Link to={`/notes/${doc.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium">{doc.title}</div>
              {!compact && (
                <div className="truncate text-[11px] text-slate-500">
                  {KIND_LABELS[doc.kind]}
                  {doc.url ? ` / ${hostOf(doc.url)}` : ""}
                  {doc.file ? ` / ${doc.file.slice(doc.file.lastIndexOf("/") + 1)}` : ""}
                </div>
              )}
            </Link>
            {doc.file && projectDir && (
              <button
                onClick={() => {
                  setOpenError(null);
                  desktop.openAsset(projectDir, doc.file!).catch((error: unknown) => setOpenError(`Could not open ${doc.title}: ${String(error)}`));
                }}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-ink"
                title="Open the attached file"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-ink" title="Open original">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {!readOnly && <button
              className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand group-hover:opacity-100"
              title="Unlink this document"
              onClick={() => unlinkDocument(doc.id, entityId)}
            >
              <X className="h-3.5 w-3.5" />
            </button>}
          </div>
        );
      })}

      {openError && <div className="text-[11px] text-red-700">{openError}</div>}

      {readOnly ? null : adding ? (
        <AddLinkForm
          onCancel={() => setAdding(false)}
          onSave={(title, url, kind) => {
            addDocumentLink(entityId, { title, url, kind });
            setAdding(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button className="flex items-center gap-1 text-brand-ink hover:underline" onClick={() => setAdding(true)}>
            <Link2 className="h-3.5 w-3.5" /> Add document link
          </button>
          {isDesktop() && (
            <button className="flex items-center gap-1 text-brand-ink hover:underline" onClick={() => void attachFile(entityId)} title="Copy a PDF or other file into the project folder">
              <FileUp className="h-3.5 w-3.5" /> Attach file
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function UrlForm({ initial, placeholder, onSave, onCancel }: { initial: string; placeholder: string; onSave: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState(initial);
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(url.trim());
      }}
    >
      <input className="input" type="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} />
      <button type="submit" className="rounded bg-brand px-2 py-1 text-charcoal hover:bg-brand-hover">
        Save
      </button>
      <button type="button" className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

export function AddLinkForm({ onSave, onCancel }: { onSave: (title: string, url: string, kind: DocumentKind) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<DocumentKind>("guide");
  return (
    <form
      className="flex flex-col gap-2 rounded border border-brand-line bg-brand-wash/40 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() && !url.trim()) return;
        onSave(title, url, kind);
      }}
    >
      <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. AX030120 datasheet" />
      <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... (optional for an internal note)" />
      <div className="flex items-center gap-2">
        <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
          {(Object.keys(KIND_LABELS) as DocumentKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="submit" className="ml-auto rounded bg-brand px-2 py-1 text-charcoal hover:bg-brand-hover">
          Add
        </button>
        <button type="button" className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
