import { create } from "zustand";
import type { Position as Point } from "@/model/types";

// Every wire and bus bar publishes its polyline here so wires can draw hops where
// they cross something else. Keyed by entity id.
interface WireRegistry {
  polylines: Record<string, Point[]>;
  publish: (id: string, points: Point[]) => void;
  retract: (id: string) => void;
}

export const useWireRegistry = create<WireRegistry>((set) => ({
  polylines: {},
  publish: (id, points) =>
    set((state) => {
      const current = state.polylines[id];
      if (current && samePolyline(current, points)) return state;
      return { polylines: { ...state.polylines, [id]: points } };
    }),
  retract: (id) =>
    set((state) => {
      if (!(id in state.polylines)) return state;
      const next = { ...state.polylines };
      delete next[id];
      return { polylines: next };
    }),
}));

function samePolyline(a: Point[], b: Point[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}
