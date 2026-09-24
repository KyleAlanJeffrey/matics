import { create } from "zustand";
import { isBusRef, type Connection, type PortKind, type Project } from "@/model/types";
import { portKindOf } from "@/model/derived";

// What the legend can hide or highlight: one bus, or a whole signal family.
export type VisibilityKey = `bus:${string}` | `kind:${PortKind}`;

interface DiagramViewState {
  hidden: VisibilityKey[];
  highlightBusId: string | null;
  toggleHidden: (key: VisibilityKey) => void;
  setHighlight: (busId: string | null) => void;
}

// Per-session view settings for the canvas. Not part of the project file.
export const useDiagramView = create<DiagramViewState>((set) => ({
  hidden: [],
  highlightBusId: null,
  toggleHidden: (key) =>
    set((state) => ({ hidden: state.hidden.includes(key) ? state.hidden.filter((k) => k !== key) : [...state.hidden, key] })),
  setHighlight: (busId) => set((state) => ({ highlightBusId: state.highlightBusId === busId ? null : busId })),
}));

export function wireVisibilityKey(project: Project, connection: Connection): VisibilityKey {
  if (isBusRef(connection.to)) return `bus:${connection.to.busId}`;
  return `kind:${portKindOf(project, connection.from.deviceId, connection.from.portId) ?? "digital-out"}`;
}
