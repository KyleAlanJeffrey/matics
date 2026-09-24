import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Archive, ChevronDown, FolderOpen, FolderSearch, LayoutGrid, List, PackageOpen, Plus, Search, Star, Upload } from "lucide-react";
import { prefKey, useProjectStore } from "@/store/project-store";
import { desktop, entryDate, fileManagerName, isDesktop, shortPath } from "@/lib/desktop";
import { reportErrors, useRunCommand, useShowOpenedProject } from "@/lib/commands";
import { MenuItem, MenuPanel, useDropdown } from "@/components/Menu";
import { dayLabel } from "./dates";
import { useSummaries } from "./summaries";
import { FeaturedProject, ProjectCard, ProjectRow, type HomeEntry } from "./ProjectCards";

type Section = "projects" | "starred" | "archived";
type Sort = "opened" | "edited" | "name";
type Layout = "grid" | "list";

const SECTIONS: { id: Section; label: string; icon: typeof Star; title: string; subtitle: string; empty: string }[] = [
  {
    id: "projects",
    label: "Projects",
    icon: FolderOpen,
    title: "Projects",
    subtitle: "Your diagrams, documentation and sketches in one place.",
    empty: "No projects yet. Start a new one or import one.",
  },
  { id: "starred", label: "Starred", icon: Star, title: "Starred", subtitle: "The projects you starred.", empty: "Star a project from its menu to keep it here." },
  {
    id: "archived",
    label: "Archived",
    icon: Archive,
    title: "Archived",
    subtitle: "Kept out of the project list. Restore one from its menu.",
    empty: "Nothing archived.",
  },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "opened", label: "Last opened" },
  { id: "edited", label: "Last edited" },
  { id: "name", label: "Name" },
];

// How the viewer likes the list, kept in this browser only. Storage can be unavailable
// (private windows), in which case the choice lasts until the page closes.
function useRemembered<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && allowed.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const remember = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Not remembered; see above.
    }
  };
  return [value, remember];
}

// The project chooser shown before any project's pages. Opening a project goes to its
// diagram; the header's Matics logo comes back here.
export function HomeView() {
  const projects = useProjectStore((s) => s.projects);
  const prefs = useProjectStore((s) => s.prefs);
  const currentId = useProjectStore((s) => s.project.id);
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.find((s) => s.id === params.get("show")) ?? SECTIONS[0];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useRemembered<Sort>("matics:home-sort", ["opened", "edited", "name"], "opened");
  const [layout, setLayout] = useRemembered<Layout>("matics:home-layout", ["grid", "list"], "grid");
  const summaryOf = useSummaries(projects);

  const entries = useMemo(() => {
    const starred = new Set(prefs.starred);
    const archived = new Set(prefs.archived);
    return projects.map((meta): HomeEntry & { openedAt: number; editedAt: number } => {
      const key = prefKey(meta.id);
      const edited = entryDate(meta.updatedAt);
      const opened = prefs.opened[key] ? new Date(prefs.opened[key]) : null;
      const when = sort !== "edited" && opened ? `Opened ${dayLabel(opened)}` : `Edited ${dayLabel(edited)}`;
      return {
        meta,
        summary: undefined,
        starred: starred.has(key),
        archived: archived.has(key),
        when,
        openedAt: (opened ?? edited).getTime(),
        editedAt: edited.getTime(),
      };
    });
  }, [projects, prefs, sort]);

  const query = search.trim().toLowerCase();
  const inSection = entries.filter((e) => (section.id === "archived" ? e.archived : !e.archived && (section.id === "projects" || e.starred)));
  const listed = inSection
    .map((e) => ({ ...e, summary: summaryOf(e.meta) }))
    .filter((e) => {
      if (!query) return true;
      const description = e.summary?.kind === "ready" ? (e.summary.description ?? "") : "";
      return `${e.meta.name} ${description}`.toLowerCase().includes(query);
    })
    .sort((a, b) =>
      sort === "name" ? a.meta.name.localeCompare(b.meta.name) : sort === "edited" ? b.editedAt - a.editedAt : b.openedAt - a.openedAt,
    );
  const featured = section.id === "projects" && !query ? listed.find((e) => e.meta.id === currentId) : undefined;

  return (
    <div className="flex h-full bg-canvas text-[13px] text-slate-800">
      <Sidebar section={section.id} onSection={(id) => setParams(id === "projects" ? {} : { show: id }, { replace: true })} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-8 py-7">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-slate-900">{section.title}</h1>
              <p className="mt-1 text-[15px] text-slate-600">{section.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 pt-1">
              <ImportButton />
              <NewProjectButton />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input !h-10 !rounded-md !pl-9 !text-[14px]"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="relative flex h-10 shrink-0 items-center rounded-md border border-slate-300 bg-white pl-3 pr-8 text-[14px]">
              <span className="text-slate-500">Sort:</span>
              <select className="appearance-none bg-transparent pl-1 font-medium text-slate-800 outline-none" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-500" />
            </label>
            <div className="flex shrink-0 gap-1">
              <LayoutButton active={layout === "grid"} onClick={() => setLayout("grid")} title="Cards">
                <LayoutGrid className="h-4 w-4" />
              </LayoutButton>
              <LayoutButton active={layout === "list"} onClick={() => setLayout("list")} title="List">
                <List className="h-4 w-4" />
              </LayoutButton>
            </div>
          </div>

          {featured && (
            <section className="mt-6">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Continue working</h2>
              <FeaturedProject entry={featured} />
            </section>
          )}

          <section className="mt-7">
            {section.id === "projects" && (
              <h2 className="mb-3 flex items-baseline gap-2 text-[17px] font-bold text-slate-900">
                All projects <span className="text-[14px] font-medium text-slate-500">{listed.length}</span>
              </h2>
            )}
            {listed.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center text-slate-500">
                {query ? "No projects match that search." : section.empty}
              </div>
            ) : layout === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
                {listed.map((entry) => (
                  <ProjectCard key={entry.meta.id} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-b-0 border-slate-200">
                {listed.map((entry) => (
                  <ProjectRow key={entry.meta.id} entry={entry} />
                ))}
              </div>
            )}
          </section>

          <footer className="mt-auto flex justify-between pt-8 text-[12px] text-slate-500">
            <span>{isDesktop() ? "Each project is a folder on this computer." : "Projects are kept in this browser."}</span>
            <span>{countLabel(listed.length)}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function countLabel(count: number) {
  return count === 1 ? "1 project" : `${count} projects`;
}

function Sidebar({ section, onSection }: { section: Section; onSection: (section: Section) => void }) {
  const workspaceDir = useProjectStore((s) => s.workspaceDir);
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5">
      <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Workspace</div>
      <nav className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSection(s.id)}
            className={`flex items-center gap-2.5 rounded-r-md border-l-[3px] px-3 py-2 text-left text-[14px] ${
              s.id === section ? "border-brand bg-brand-wash font-semibold text-slate-900" : "border-transparent text-slate-700 hover:bg-slate-50"
            }`}
          >
            <s.icon className={`h-4 w-4 ${s.id === section ? "text-brand" : "text-slate-500"}`} />
            {s.label}
          </button>
        ))}
      </nav>
      {workspaceDir && (
        <div className="mt-auto border-t border-slate-200 pt-4">
          <button
            onClick={() => void reportErrors(() => desktop.reveal(workspaceDir))}
            className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
            title={`${workspaceDir}\nShow in ${fileManagerName()}`}
          >
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span className="min-w-0">
              <span className="block text-slate-800">Project folder</span>
              <span className="block truncate text-[12px] text-slate-500">{shortPath(workspaceDir)}</span>
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}

function LayoutButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex h-10 w-10 items-center justify-center rounded-md border ${active ? "border-brand-line bg-brand-wash text-brand-ink" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function NewProjectButton() {
  const run = useRunCommand();
  return (
    <button onClick={() => run("file:new")} className="flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-[14px] font-semibold text-charcoal hover:bg-brand-hover">
      <Plus className="h-4 w-4" /> New project
    </button>
  );
}

const IMPORT_BUTTON = "flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-[14px] font-medium text-slate-800 hover:bg-slate-50";

// The desktop app can open packages and folders as well as diagram files; the browser
// build only reads diagram files, through a file input.
function ImportButton() {
  const run = useRunCommand();
  const { open, setOpen, ref } = useDropdown();
  const input = useRef<HTMLInputElement>(null);
  const importProject = useProjectStore((s) => s.importProject);
  const showOpened = useShowOpenedProject();

  if (!isDesktop()) {
    return (
      <>
        <button onClick={() => input.current?.click()} className={IMPORT_BUTTON}>
          <Upload className="h-4 w-4" /> Import project
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void reportErrors(() => showOpened(() => importProject(file)));
          }}
        />
      </>
    );
  }

  const item = (command: Parameters<typeof run>[0]) => () => {
    setOpen(false);
    run(command);
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={IMPORT_BUTTON}>
        <Upload className="h-4 w-4" /> Import project <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open && (
        <MenuPanel align="right">
          <MenuItem icon={PackageOpen} label="Open package (.matics)..." onClick={item("file:open-package")} />
          <MenuItem icon={FolderSearch} label="Open project folder..." onClick={item("file:open-folder")} />
          <MenuItem icon={Upload} label="Import diagram (.json)..." onClick={item("file:import-diagram")} />
        </MenuPanel>
      )}
    </div>
  );
}
