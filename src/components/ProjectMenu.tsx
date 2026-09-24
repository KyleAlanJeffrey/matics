import { useState } from "react";
import { ChevronDown, Copy, FilePlus2, FolderOpen, Package, PackageOpen, Pencil, Trash2 } from "lucide-react";
import { useProjectStore } from "@/store/project-store";
import { sampleProject } from "@/model/sample-project";
import { entryDate, isDesktop } from "@/lib/desktop";
import { MenuHeading, MenuItem, MenuSeparator, useDropdown } from "./Menu";

export function ProjectMenu() {
  const {
    project,
    projects,
    projectDir,
    createProject,
    switchProject,
    renameProject,
    setProjectDescription,
    duplicateProject,
    deleteProject,
    revealProject,
    packageProject,
    openPackage,
  } = useProjectStore();
  const { open, setOpen, ref: menuRef } = useDropdown();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  const runAndClose = (action: () => Promise<void>) => {
    setOpen(false);
    action().catch((error: unknown) => window.alert(error instanceof Error ? error.message : String(error)));
  };

  const startRename = () => {
    setDraftName(project.name);
    setRenaming(true);
    setOpen(false);
  };

  const commitRename = () => {
    const name = draftName.trim();
    if (name && name !== project.name) renameProject(name);
    setRenaming(false);
  };

  const onNew = async () => {
    const name = window.prompt("Name for the new diagram", "New diagram");
    if (!name) return;
    await createProject(name.trim(), { copyLibrary: true });
    setOpen(false);
  };

  const onNewFromSample = async () => {
    await createProject(sampleProject.name, { fromSample: true });
    setOpen(false);
  };

  const onSubtitle = () => {
    const next = window.prompt("Subtitle shown under the diagram title", project.description ?? "");
    if (next !== null) setProjectDescription(next);
    setOpen(false);
  };

  const onDelete = async () => {
    const warning = isDesktop() ? `Move "${project.name}" to the Trash?` : `Delete "${project.name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    await deleteProject(project.id);
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      {renaming ? (
        <input
          className="input w-56 font-semibold"
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          onDoubleClick={startRename}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[15px] font-semibold text-white hover:bg-white/10"
          title="Switch or manage diagrams (double-click to rename)"
        >
          {project.name}
          <ChevronDown className="h-4 w-4 text-white/60" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <MenuHeading>Diagrams</MenuHeading>
          <div className="max-h-64 overflow-y-auto">
            {projects.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  void switchProject(entry.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
                  entry.id === project.id ? "bg-brand-wash text-brand-ink" : "hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{entry.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-slate-400">{entryDate(entry.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
          <MenuSeparator />
          <MenuItem icon={FilePlus2} label="New diagram" hint="keeps the product library" onClick={onNew} />
          <MenuItem icon={FilePlus2} label="New from the demo sample" onClick={onNewFromSample} />
          <MenuItem icon={Pencil} label="Rename" onClick={startRename} />
          <MenuItem icon={Pencil} label="Edit subtitle" onClick={onSubtitle} />
          <MenuItem icon={Copy} label="Duplicate" onClick={() => void duplicateProject().then(() => setOpen(false))} />
          {isDesktop() && (
            <>
              <MenuItem icon={FolderOpen} label="Show in Finder" hint={projectDir ? shortPath(projectDir) : undefined} onClick={() => void revealProject().then(() => setOpen(false))} />
              <MenuItem icon={Package} label="Package as .matics..." onClick={() => runAndClose(packageProject)} />
              <MenuItem icon={PackageOpen} label="Open .matics package..." onClick={() => runAndClose(openPackage)} />
            </>
          )}
          <MenuSeparator />
          <MenuItem icon={Trash2} label={isDesktop() ? "Move diagram to Trash" : "Delete diagram"} danger onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

function shortPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}
