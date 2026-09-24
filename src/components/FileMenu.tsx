import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ChevronDown, CircleArrowDown, FileImage, FilePlus2, FileText, FolderOpen, Image, Package, PackageOpen, Save } from "lucide-react";
import { isDesktop } from "@/lib/desktop";
import { shortcutFor, type CommandId } from "@/lib/commands";
import { MenuHeading, MenuItem, MenuPanel, MenuSeparator, useDropdown } from "./Menu";

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";

// The File menu for Windows, Linux and the browser build; macOS has the same items in its
// menu bar.
export function FileMenu({ run }: { run: (command: CommandId) => void }) {
  const { open, setOpen, ref } = useDropdown();
  const [version, setVersion] = useState<string | null>(null);
  const desktop = isDesktop();

  useEffect(() => {
    if (desktop) void getVersion().then(setVersion);
  }, [desktop]);

  const item = (command: CommandId) => () => {
    setOpen(false);
    run(command);
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
              <MenuItem icon={FolderOpen} label="Open project..." hint={shortcutFor("file:open-project")} onClick={item("file:open-project")} />
              <MenuItem icon={PackageOpen} label="Open compressed project..." hint={shortcutFor("file:open-compressed")} onClick={item("file:open-compressed")} />
              <MenuSeparator />
            </>
          )}
          <MenuItem icon={Save} label="Save" hint={`${MOD}+S`} onClick={item("file:save")} />
          {desktop && <MenuItem icon={Package} label="Save compressed copy..." hint={shortcutFor("file:save-compressed")} onClick={item("file:save-compressed")} />}
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
    </div>
  );
}
