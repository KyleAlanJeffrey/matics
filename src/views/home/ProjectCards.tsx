import { useNavigate } from "react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Clock,
  Cpu,
  FileText,
  Folder,
  FolderOpen,
  MessagesSquare,
  MoreVertical,
  Pencil,
  Star,
  StarOff,
  Trash2,
  Workflow,
} from "lucide-react";
import type { ProjectMeta } from "@/model/types";
import { useProjectStore } from "@/store/project-store";
import { desktop, fileManagerName, fileName, isDesktop, trashName } from "@/lib/desktop";
import { reportErrors } from "@/lib/commands";
import { MenuItem, MenuPanel, MenuSeparator, useDropdown } from "@/components/Menu";
import { SchematicThumbnail } from "./SchematicThumbnail";
import type { Summary } from "./summaries";

// One project as the home lists it: what the cards show and how to reach it.
export interface HomeEntry {
  meta: ProjectMeta;
  summary: Summary | undefined;
  starred: boolean;
  archived: boolean;
  // "Opened today", "Edited Sep 20".
  when: string;
}

export function useOpenProject() {
  const navigate = useNavigate();
  const switchProject = useProjectStore((s) => s.switchProject);
  return (entry: HomeEntry, page = "/schematic") =>
    void reportErrors(async () => {
      await switchProject(entry.meta.id);
      navigate(page);
    });
}

function Preview({ entry, width, height }: { entry: HomeEntry; width: number; height: number }) {
  const summary = entry.summary;
  const empty =
    summary?.kind === "broken" ? (
      "Cannot be opened"
    ) : summary && summary.sketches > 0 ? (
      <>
        <Pencil className="h-4 w-4" />
        {summary.sketches === 1 ? "1 sketch" : `${summary.sketches} sketches`}
      </>
    ) : (
      "Empty diagram"
    );
  return <SchematicThumbnail thumbnail={summary?.kind === "ready" ? summary.thumbnail : summary ? null : undefined} width={width} height={height} empty={empty} />;
}

function Title({ entry, className }: { entry: HomeEntry; className: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`truncate font-bold text-slate-900 ${className}`}>{entry.meta.name}</span>
      {entry.starred && <Star className="h-4 w-4 shrink-0 fill-brand text-brand" aria-label="Starred" />}
    </div>
  );
}

function Description({ entry, className = "" }: { entry: HomeEntry; className?: string }) {
  const summary = entry.summary;
  if (summary?.kind === "broken") {
    return (
      <div className={`truncate text-red-700 ${className}`} title={summary.reason}>
        Saved by an older build; it cannot be opened here.
      </div>
    );
  }
  // Keeps its line when empty so the cards line up.
  return <div className={`min-h-[1lh] truncate text-slate-600 ${className}`}>{summary?.description}</div>;
}

function Facts({ entry }: { entry: HomeEntry }) {
  const dir = entry.meta.dir;
  return (
    <div className="flex min-w-0 items-center gap-4 text-[12px] text-slate-500">
      <span className="flex shrink-0 items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" /> {entry.when}
      </span>
      <span className="flex min-w-0 items-center gap-1.5" title={dir}>
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{dir ? fileName(dir) : "In this browser"}</span>
      </span>
    </div>
  );
}

function ProjectActions({ entry }: { entry: HomeEntry }) {
  const { open, setOpen, ref } = useDropdown();
  const { setStarred, setArchived, deleteProject } = useProjectStore();
  const openProject = useOpenProject();
  const act = (action: () => unknown) => () => {
    setOpen(false);
    void reportErrors(async () => action());
  };
  const onDelete = async () => {
    const name = entry.meta.name;
    const warning = isDesktop() ? `Move "${name}" to the ${trashName()}?` : `Delete "${name}"? This cannot be undone.`;
    if (window.confirm(warning)) await deleteProject(entry.meta.id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${open ? "bg-slate-100 text-slate-800" : ""}`}
        title="Project actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <MenuPanel align="right">
          <MenuItem icon={ArrowRight} label="Open" onClick={act(() => openProject(entry))} />
          <MenuItem icon={entry.starred ? StarOff : Star} label={entry.starred ? "Remove star" : "Star"} onClick={act(() => setStarred(entry.meta.id, !entry.starred))} />
          <MenuItem
            icon={entry.archived ? ArchiveRestore : Archive}
            label={entry.archived ? "Restore to projects" : "Archive"}
            onClick={act(() => setArchived(entry.meta.id, !entry.archived))}
          />
          {entry.meta.dir && <MenuItem icon={FolderOpen} label={`Show in ${fileManagerName()}`} onClick={act(() => desktop.reveal(entry.meta.dir!))} />}
          <MenuSeparator />
          <MenuItem icon={Trash2} label={isDesktop() ? `Move to ${trashName()}` : "Delete"} danger onClick={act(onDelete)} />
        </MenuPanel>
      )}
    </div>
  );
}

const PAGES = [
  { to: "/schematic", label: "Diagram", icon: Workflow },
  { to: "/notes", label: "Documentation", icon: FileText },
  { to: "/io", label: "I/O", icon: Cpu },
  { to: "/communications", label: "Communications", icon: MessagesSquare },
  { to: "/sketches", label: "Sketches", icon: Pencil },
];

export function FeaturedProject({ entry }: { entry: HomeEntry }) {
  const openProject = useOpenProject();
  return (
    <div className="flex gap-5 rounded-lg border border-slate-200 bg-white p-4">
      <button onClick={() => openProject(entry)} className="shrink-0" title="Open project">
        <Preview entry={entry} width={240} height={136} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <Title entry={entry} className="text-[20px]" />
        <Description entry={entry} className="text-[15px]" />
        <Facts entry={entry} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {PAGES.map((page) => (
            <button key={page.to} onClick={() => openProject(entry, page.to)} className="flex items-center gap-1.5 rounded text-slate-700 hover:text-brand-ink">
              <page.icon className="h-4 w-4 text-slate-500" />
              {page.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <ProjectActions entry={entry} />
        <button
          onClick={() => openProject(entry)}
          className="my-auto flex items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50"
        >
          Open project <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// The card is one big button; the actions menu sits over its corner, outside the button.
export function ProjectCard({ entry }: { entry: HomeEntry }) {
  const openProject = useOpenProject();
  return (
    <div className="group relative">
      <button
        onClick={() => openProject(entry)}
        className="flex w-full gap-4 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300 hover:bg-slate-50"
      >
        <Preview entry={entry} width={184} height={112} />
        <div className="flex min-w-0 flex-1 flex-col py-1 pr-8">
          <Title entry={entry} className="text-[16px]" />
          <Description entry={entry} className="mt-1" />
          <div className="mt-auto">
            <Facts entry={entry} />
          </div>
        </div>
        {entry.summary?.kind !== "broken" && (
          <span className="pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-charcoal group-hover:flex">
            Open <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </button>
      <div className="absolute right-2 top-2">
        <ProjectActions entry={entry} />
      </div>
    </div>
  );
}

export function ProjectRow({ entry }: { entry: HomeEntry }) {
  const openProject = useOpenProject();
  return (
    <div className="group relative">
      <button onClick={() => openProject(entry)} className="flex w-full items-center gap-4 border-b border-slate-200 bg-white px-3 py-2 pr-12 text-left hover:bg-slate-50">
        <Preview entry={entry} width={80} height={48} />
        <div className="flex min-w-0 flex-[2] flex-col">
          <Title entry={entry} className="text-[14px]" />
          <Description entry={entry} className="text-[12px]" />
        </div>
        <div className="hidden min-w-0 flex-1 lg:block">
          <Facts entry={entry} />
        </div>
      </button>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <ProjectActions entry={entry} />
      </div>
    </div>
  );
}
