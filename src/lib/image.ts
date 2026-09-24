const MAX_EDGE = 320;

// Downscale to keep the project blob small; images live inside the IndexedDB record.
export async function fileToThumbnailDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  return hasAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

export const SCHEMATIC_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
// The browser build keeps pictures inside the IndexedDB record, so big photos shrink.
const BROWSER_MAX_EDGE = 1600;
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

// A picture dropped on the schematic. In the desktop app the original file is copied into
// the project's assets folder (writeAsset); in the browser it is kept as a data URL.
export async function loadSchematicImage(file: File, writeAsset?: (name: string, ext: string, base64: string) => Promise<string>): Promise<LoadedImage> {
  const { width, height } = await naturalSize(file);
  if (writeAsset) {
    const base64 = await fileToBase64(file);
    const rel = await writeAsset(file.name.replace(/\.[^.]+$/, "") || "picture", EXTENSIONS[file.type] ?? "png", base64);
    return { src: rel, width, height };
  }
  const raster = file.type !== "image/svg+xml" && file.type !== "image/gif";
  if (raster && Math.max(width, height) > BROWSER_MAX_EDGE) {
    const scale = BROWSER_MAX_EDGE / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const bitmap = await createImageBitmap(file);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const src = file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.88) : canvas.toDataURL("image/png");
    return { src, width, height };
  }
  return { src: await fileToDataUrl(file), width, height };
}

function naturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // SVGs without a width or height report 0; give them a sensible box.
      resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name} as a picture.`));
    };
    img.src = url;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File) {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
