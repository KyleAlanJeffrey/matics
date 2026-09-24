import { useEffect, useMemo, useReducer } from "react";
import type { Project, ProjectMeta } from "@/model/types";
import { assertCompleteProject } from "@/model/project-shape";
import { useProject, useProjectStore } from "@/store/project-store";
import { thumbnailOf, type Thumbnail } from "./thumbnail";

export type Summary =
  | { kind: "ready"; description?: string; thumbnail: Thumbnail | null; sketches: number }
  | { kind: "broken"; reason: string };

function summarize(project: Project): Summary {
  return { kind: "ready", description: project.description, thumbnail: thumbnailOf(project), sketches: Object.keys(project.sketches).length };
}

function summarizeStored(raw: unknown): Summary {
  try {
    assertCompleteProject(raw, "This project");
    return summarize(raw);
  } catch (error) {
    return { kind: "broken", reason: error instanceof Error ? error.message : String(error) };
  }
}

// Kept across visits to the home page, one per project; a save changes updatedAt, which
// makes the cached summary stale.
const cache = new Map<string, { updatedAt: string; summary: Summary }>();

function cached(entry: ProjectMeta) {
  const hit = cache.get(entry.id);
  return hit?.updatedAt === entry.updatedAt ? hit.summary : undefined;
}

// Previews for the project cards. Other projects are read from storage one at a time and
// fill in as they arrive; the open project comes from memory.
export function useSummaries(entries: ProjectMeta[]) {
  const project = useProject();
  const current = useMemo(() => summarize(project), [project]);
  const [, arrived] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const entry of entries) {
        if (cancelled) return;
        if (entry.id === useProjectStore.getState().project.id || cached(entry)) continue;
        let summary: Summary;
        try {
          const raw = await useProjectStore.getState().peekProject(entry.id);
          summary = raw === undefined ? { kind: "broken", reason: "The project could not be found." } : summarizeStored(raw);
        } catch (error) {
          summary = { kind: "broken", reason: error instanceof Error ? error.message : String(error) };
        }
        cache.set(entry.id, { updatedAt: entry.updatedAt, summary });
        if (!cancelled) arrived();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return (entry: ProjectMeta): Summary | undefined => (entry.id === project.id ? current : cached(entry));
}
