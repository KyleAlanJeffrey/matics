import { desktop, fileName, isDesktop } from "./desktop";

const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  json: { name: "JSON", extensions: ["json"] },
  pdf: { name: "PDF document", extensions: ["pdf"] },
  png: { name: "PNG image", extensions: ["png"] },
  svg: { name: "SVG image", extensions: ["svg"] },
};

// Saves an export. The desktop app asks where with the native save panel; the browser
// build downloads it. Resolves false when the user cancels the panel.
export async function saveFile(filename: string, blob: Blob): Promise<boolean> {
  if (!isDesktop()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const path = await desktop.pickSavePath(`Save ${fileName(filename)}`, filename, FILTERS[ext] ? [FILTERS[ext]] : []);
  if (!path) return false;
  await desktop.writeExportFile(path, await blobToBase64(blob));
  return true;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
