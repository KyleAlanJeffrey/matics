import { useRef } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, Download, FileImage, FileText, FolderSearch, Image, PackageOpen, Package, Save, Upload } from "lucide-react";
import { useProjectStore } from "@/store/project-store";
import { isDesktop } from "@/lib/desktop";
import { MenuHeading, MenuItem, MenuSeparator, useDropdown } from "./Menu";

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";

export function FileMenu({ onSave }: { onSave: () => void }) {
  const { exportProject, importProject, exportLibrary, importLibrary, openProjectFolder } = useProjectStore();
  const { open, setOpen, ref } = useDropdown();
  const navigate = useNavigate();
  const projectInput = useRef<HTMLInputElement>(null);
  const productsInput = useRef<HTMLInputElement>(null);

  const run = (action: () => unknown) => () => {
    setOpen(false);
    void action();
  };

  const onImportProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importProject(file);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not import that file.");
    }
  };

  const onImportProducts = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await importLibrary(file);
      window.alert(count === 1 ? "Imported 1 product." : `Imported ${count} products.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not import that file.");
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-white/80 ${open ? "bg-white/10" : "hover:bg-white/10"}`}>
        File <ChevronDown className="h-3.5 w-3.5 text-white/50" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <MenuItem icon={Save} label="Save" hint={`${MOD}+S`} onClick={run(onSave)} />
          {isDesktop() && <MenuItem icon={FolderSearch} label="Open project folder..." onClick={run(openProjectFolder)} />}
          <MenuSeparator />
          <MenuHeading>Diagram file</MenuHeading>
          <MenuItem icon={Upload} label="Import diagram (.json)..." onClick={() => projectInput.current?.click()} />
          <MenuItem icon={Download} label="Export diagram (.json)" onClick={run(exportProject)} />
          <MenuHeading>Product library</MenuHeading>
          <MenuItem icon={PackageOpen} label="Import products (.json)..." onClick={() => productsInput.current?.click()} />
          <MenuItem icon={Package} label="Export products (.json)" onClick={run(exportLibrary)} />
          <MenuSeparator />
          <MenuHeading>Report</MenuHeading>
          <MenuItem icon={FileText} label="Open report" onClick={run(() => navigate("/report"))} />
          <MenuItem icon={FileText} label="Export report as PDF" onClick={run(() => navigate("/report?download=pdf"))} />
          <MenuItem icon={FileImage} label="Export report as PNG" onClick={run(() => navigate("/report?download=png"))} />
          <MenuItem icon={Image} label="Export schematic as PNG" onClick={run(() => navigate("/report?download=schematic"))} />
        </div>
      )}
      <input
        ref={projectInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          setOpen(false);
          void onImportProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={productsInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          setOpen(false);
          void onImportProducts(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
