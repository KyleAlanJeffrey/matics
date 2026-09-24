import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  ChevronDown,
  CircleArrowDown,
  Download,
  FileImage,
  FilePlus2,
  FileText,
  FolderSearch,
  Image,
  PackageOpen,
  Package,
  Save,
  Upload,
} from "lucide-react";
import { useProjectStore } from "@/store/project-store";
import { isDesktop } from "@/lib/desktop";
import { shortcutFor, type CommandId } from "@/lib/commands";
import { MenuHeading, MenuItem, MenuPanel, MenuSeparator, useDropdown } from "./Menu";

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";

// The File menu for Windows, Linux and the browser build; macOS has the same items in its
// menu bar. The browser build imports through file inputs because it has no file dialogs.
export function FileMenu({ run }: { run: (command: CommandId) => void }) {
  const { importProject, importLibrary } = useProjectStore();
  const { open, setOpen, ref } = useDropdown();
  const projectInput = useRef<HTMLInputElement>(null);
  const productsInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState<string | null>(null);
  const desktop = isDesktop();

  useEffect(() => {
    if (desktop) void getVersion().then(setVersion);
  }, [desktop]);

  const item = (command: CommandId) => () => {
    setOpen(false);
    run(command);
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
        <MenuPanel>
          {desktop && (
            <>
              <MenuItem icon={FilePlus2} label="New diagram..." hint={shortcutFor("file:new")} onClick={item("file:new")} />
              <MenuItem icon={FolderSearch} label="Open project folder..." hint={shortcutFor("file:open-folder")} onClick={item("file:open-folder")} />
              <MenuItem icon={PackageOpen} label="Open package (.matics)..." hint={shortcutFor("file:open-package")} onClick={item("file:open-package")} />
              <MenuSeparator />
            </>
          )}
          <MenuItem icon={Save} label="Save" hint={`${MOD}+S`} onClick={item("file:save")} />
          {desktop && <MenuItem icon={Package} label="Package project (.matics)..." hint={shortcutFor("file:export-package")} onClick={item("file:export-package")} />}
          <MenuSeparator />
          <MenuHeading>Diagram file</MenuHeading>
          <MenuItem
            icon={Upload}
            label="Import diagram (.json)..."
            hint={desktop ? shortcutFor("file:import-diagram") : undefined}
            onClick={desktop ? item("file:import-diagram") : () => projectInput.current?.click()}
          />
          <MenuItem icon={Download} label="Export diagram (.json)" hint={desktop ? shortcutFor("file:export-diagram") : undefined} onClick={item("file:export-diagram")} />
          <MenuHeading>Product library</MenuHeading>
          <MenuItem icon={PackageOpen} label="Import products (.json)..." onClick={desktop ? item("file:import-products") : () => productsInput.current?.click()} />
          <MenuItem icon={Package} label="Export products (.json)" onClick={item("file:export-products")} />
          <MenuSeparator />
          <MenuHeading>Report</MenuHeading>
          <MenuItem icon={FileText} label="Open report" hint={desktop ? shortcutFor("view:report") : undefined} onClick={item("view:report")} />
          <MenuItem icon={FileText} label="Export report as PDF" hint={desktop ? shortcutFor("file:export-report-pdf") : undefined} onClick={item("file:export-report-pdf")} />
          <MenuItem icon={FileImage} label="Export report as PNG" onClick={item("file:export-report-png")} />
          <MenuItem icon={Image} label="Export schematic as PNG" onClick={item("file:export-schematic-png")} />
          {desktop && (
            <>
              <MenuSeparator />
              <MenuItem icon={CircleArrowDown} label="Check for updates..." hint={version ? `Matics ${version}` : undefined} onClick={item("app:check-updates")} />
            </>
          )}
        </MenuPanel>
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
