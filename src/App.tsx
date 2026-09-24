import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "@/components/AppShell";
import { useProjectStore } from "@/store/project-store";
import { DiagramView } from "@/views/diagram/DiagramView";
import { NotesView } from "@/views/notes/NotesView";
import { CommunicationsView } from "@/views/communications/CommunicationsView";
import { SketchesView } from "@/views/sketches/SketchesView";
import { ReportView } from "@/views/report/ReportView";
import { HomeView } from "@/views/home/HomeView";

export default function App() {
  const load = useProjectStore((s) => s.load);
  const loaded = useProjectStore((s) => s.loaded);
  const loadError = useProjectStore((s) => s.loadError);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        {loadError ? (
          <>
            <div className="text-red-600">Could not load the project: {loadError}</div>
            <button className="rounded border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          "Loading project..."
        )}
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/schematic" element={<DiagramView />} />
        <Route path="/communications" element={<CommunicationsView />} />
        <Route path="/sketches" element={<SketchesView />} />
        <Route path="/report" element={<ReportView />} />
        <Route path="/notes" element={<NotesView />} />
        <Route path="/notes/:entityId" element={<NotesView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

