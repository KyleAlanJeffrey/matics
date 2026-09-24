import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

const BUTTON = "flex h-full w-12 items-center justify-center text-white/80 hover:text-white";

// Minimize, maximize and close for Windows, which draws no title bar of its own.
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const update = () => void win.isMaximized().then(setMaximized);
    update();
    const unlisten = win.onResized(update);
    return () => void unlisten.then((stop) => stop());
  }, []);

  return (
    <div className="ml-2 flex h-full">
      <button className={`${BUTTON} hover:bg-white/10`} onClick={() => void getCurrentWindow().minimize()} title="Minimize">
        <Minus className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button className={`${BUTTON} hover:bg-white/10`} onClick={() => void getCurrentWindow().toggleMaximize()} title={maximized ? "Restore" : "Maximize"}>
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" strokeWidth={1.5} /> : <Square className="h-3.5 w-3.5" strokeWidth={1.5} />}
      </button>
      <button className={`${BUTTON} hover:bg-[#c42b1c]`} onClick={() => void getCurrentWindow().close()} title="Close">
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
