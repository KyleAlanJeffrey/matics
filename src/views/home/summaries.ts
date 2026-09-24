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

// Kept across visits to the home page; a save changes updatedAt and so the key.
const cache = new Map<string, Summary>();
const cacheKey = (entry: ProjectMeta) => `${entry.id}@${entry.updatedAt}`;

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
        const key = cacheKey(entry);
        if (cancelled) return;
        if (entry.id === useProjectStore.getState().project.id || cache.has(key)) continue;
        try {
          const raw = await useProjectStore.getState().peekProject(entry.id);
          cache.set(key, raw === undefined ? { kind: "broken", reason: "The project could not be found." } : summarizeStored(raw));
        } catch (error) {
          cache.set(key, { kind: "broken", reason: error instanceof Error ? error.message : String(error) });
        }
        if (!cancelled) arrived();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return (entry: ProjectMeta): Summary | undefined => (entry.id === project.id ? current : cache.get(cacheKey(entry)));
}
