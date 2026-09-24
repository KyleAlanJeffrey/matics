import { lazy, Suspense, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ChevronDown, Download, FileText, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useDropdown, MenuItem, MenuSeparator } from "@/components/Menu";
import { saveFile } from "@/lib/save-file";
import { safeFilename } from "@/store/persistence";
import { docHref } from "@/views/notes/NotesView";
import type { Project, Sketch } from "@/model/types";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

const SketchCanvas = lazy(() => {
  // The hand-drawn fonts ship with the app (public/excalidraw/fonts) so sketches render offline.
  window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";
  return import("./SketchCanvas");
});

// Quick freeform drawings: shapes, arrows, freehand, text and images, several per project,
// optionally linked to the devices they are about.
export function SketchesView() {
  const project = useProject();
  const { addSketch, saveSketchScene } = useProjectStore();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const api = useRef<ExcalidrawImperativeAPI | null>(null);

  const sketches = Object.values(project.sketches).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const current = project.sketches[params.get("sketch") ?? ""] ?? sketches[0];
  const q = search.trim().toLowerCase();
  const listed = sketches.filter((s) => !q || s.name.toLowerCase().includes(q));

  const open = (id: string) => setParams({ sketch: id }, { replace: true });
  const create = () => open(addSketch(`Sketch ${sketches.length + 1}`));

  return (
    <div className="flex h-full bg-white text-[13px]">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 px-3 py-4">
        <h2 className="mb-3 px-1 text-[15px] font-bold text-slate-900">Workspace sketches</h2>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-8" placeholder="Search sketches..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {listed.map((sketch) => (
            <button
              key={sketch.id}
              onClick={() => open(sketch.id)}
              className={`flex items-center gap-2 rounded-r border-l-[3px] px-2 py-1.5 text-left ${sketch.id === current?.id ? "border-brand bg-brand-wash font-medium text-slate-900" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{sketch.name}</span>
            </button>
          ))}
          {sketches.length > 0 && listed.length === 0 && <div className="px-2 py-1.5 text-slate-400">Nothing matches.</div>}
        </div>
        <button onClick={create} className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">
          <Plus className="h-4 w-4" /> New sketch
        </button>
        {current && <LinkedDevices project={project} sketch={current} />}
      </aside>

      {current ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <SketchHeader key={current.id} project={project} sketch={current} api={api} onNew={create} onRemoved={() => setParams({}, { replace: true })} />
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Loading the sketchpad...</div>}>
              <SketchCanvas
                // Duplicated projects keep their sketch ids, so the project is part of the key.
                key={`${project.id}:${current.id}`}
                sketch={current}
                onScene={(elements, files) => {
                  if (useProjectStore.getState().project.id === project.id) saveSketchScene(current.id, elements, files);
                }}
                onApi={(next) => (api.current = next)}
                onOpenLink={(link) => {
                  // Links to pages in this app open here; anything else opens normally.
                  if (!link.startsWith("/")) return false;
                  navigate(link);
                  return true;
                }}
              />
            </Suspense>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas text-slate-600">
          <div className="text-[16px] font-semibold text-slate-900">No sketches yet</div>
          <div className="max-w-sm text-center">A place for quick diagrams, rough ideas and notes. Draw shapes, arrows and text, paste images, and link a sketch to devices.</div>
          <button onClick={create} className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 font-semibold text-charcoal hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> New sketch
          </button>
        </div>
      )}
    </div>
  );
}

function SketchHeader({
  project,
  sketch,
  api,
  onNew,
  onRemoved,
}: {
  project: Project;
  sketch: Sketch;
  api: React.RefObject<ExcalidrawImperativeAPI | null>;
  onNew: () => void;
  onRemoved: () => void;
}) {
  const { updateSketch, removeSketch } = useProjectStore();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(sketch.name);
  const more = useDropdown();

  const commitRename = () => {
    if (draft.trim()) updateSketch(sketch.id, { name: draft.trim() });
    setRenaming(false);
  };

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-2.5">
      <span className="text-slate-500">Sketches</span>
      <span className="text-slate-300">/</span>
      {renaming ? (
        <input
          className="input !w-64 font-semibold"
          autoFocus
          onFocus={(e) => e.target.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          onDoubleClick={() => {
            setDraft(sketch.name);
            setRenaming(true);
          }}
          className="truncate text-[15px] font-semibold text-slate-900"
          title="Double-click to rename"
        >
          {sketch.name}
        </button>
      )}
      <div ref={more.ref} className="relative">
        <button onClick={() => more.setOpen((o) => !o)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="More">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {more.open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <MenuItem
              icon={Pencil}
              label="Rename"
              onClick={() => {
                more.setOpen(false);
                setDraft(sketch.name);
                setRenaming(true);
              }}
            />
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              label="Delete sketch"
              danger
              onClick={() => {
                more.setOpen(false);
                if (!window.confirm(`Delete ${sketch.name}? This cannot be undone.`)) return;
                removeSketch(sketch.id);
                onRemoved();
              }}
            />
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <LinkDeviceButton project={project} sketch={sketch} api={api} />
        <ExportButton sketch={sketch} api={api} />
        <button onClick={onNew} className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 font-semibold text-charcoal hover:bg-brand-hover">
          <Plus className="h-4 w-4" /> New sketch
        </button>
      </div>
    </div>
  );
}

// Adds a device to the sketch's links. With shapes selected, those shapes also link to the
// device's documentation, so clicking their link icon opens it.
function LinkDeviceButton({ project, sketch, api }: { project: Project; sketch: Sketch; api: React.RefObject<ExcalidrawImperativeAPI | null> }) {
  const updateSketch = useProjectStore((s) => s.updateSketch);
  const { open, setOpen, ref } = useDropdown();

  const link = (deviceId: string) => {
    setOpen(false);
    const device = project.devices[deviceId];
    if (!device) return;
    if (!sketch.deviceIds.includes(deviceId)) updateSketch(sketch.id, { deviceIds: [...sketch.deviceIds, deviceId] });
    const excalidraw = api.current;
    if (!excalidraw) return;
    const selected = excalidraw.getAppState().selectedElementIds;
    if (Object.keys(selected).length === 0) return;
    const href = docHref(project, device.presetId);
    excalidraw.updateScene({
      elements: excalidraw
        .getSceneElementsIncludingDeleted()
        .map((el) => (selected[el.id] ? { ...el, link: href, version: el.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() } : el)),
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
        title="Link this sketch, and any selected shapes, to a device"
      >
        <Link2 className="h-4 w-4" /> Link to device <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <div className="px-2 py-1 text-[11px] text-slate-500">Selected shapes link to the device's documentation.</div>
          {Object.values(project.devices).map((device) => (
            <button key={device.id} onClick={() => link(device.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-50">
              <span className="min-w-0 flex-1 truncate">{device.name}</span>
              {sketch.deviceIds.includes(device.id) && <span className="text-[11px] text-slate-400">linked</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportButton({ sketch, api }: { sketch: Sketch; api: React.RefObject<ExcalidrawImperativeAPI | null> }) {
  const { open, setOpen, ref } = useDropdown();

  const run = async (format: "png" | "svg") => {
    setOpen(false);
    const excalidraw = api.current;
    if (!excalidraw) return;
    const elements = excalidraw.getSceneElements();
    if (elements.length === 0) {
      window.alert("This sketch is empty.");
      return;
    }
    const { exportToBlob, exportToSvg } = await import("@excalidraw/excalidraw");
    const appState = { ...excalidraw.getAppState(), exportBackground: true };
    const files = excalidraw.getFiles();
    const name = `${safeFilename(sketch.name)}.${format}`;
    try {
      if (format === "png") {
        await saveFile(name, await exportToBlob({ elements, appState, files, mimeType: "image/png" }));
      } else {
        const svg = await exportToSvg({ elements, appState, files });
        await saveFile(name, new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <MenuItem icon={Download} label="PNG image" onClick={() => void run("png")} />
          <MenuItem icon={Download} label="SVG image" onClick={() => void run("svg")} />
        </div>
      )}
    </div>
  );
}

function LinkedDevices({ project, sketch }: { project: Project; sketch: Sketch }) {
  const updateSketch = useProjectStore((s) => s.updateSketch);
  const devices = sketch.deviceIds.map((id) => project.devices[id]).filter(Boolean);
  if (devices.length === 0) return null;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-slate-600">
        <Link2 className="h-3.5 w-3.5" /> Linked devices
      </div>
      <div className="flex flex-col gap-1.5">
        {devices.map((device) => (
          <div key={device.id} className="group flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5">
            <Link to={docHref(project, device.presetId)} className="min-w-0 flex-1 truncate text-slate-800 hover:text-brand-ink hover:underline">
              {device.name}
            </Link>
            <button
              onClick={() => updateSketch(sketch.id, { deviceIds: sketch.deviceIds.filter((id) => id !== device.id) })}
              className="text-slate-300 opacity-0 hover:text-slate-600 group-hover:opacity-100"
              title="Unlink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
