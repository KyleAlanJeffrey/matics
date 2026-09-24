import type { Project } from "@/model/types";
import { desktop, isDesktop, joinPath } from "./desktop";

// Pictures and attached files are stored in `<project>/assets/` and referenced by a path
// relative to the project folder. http(s) URLs are used as-is. Inline data URLs are
// copied into the folder when the project is saved, so a folder stands on its own.
export const ASSET_PREFIX = "assets/";

export function isAssetRef(ref: string | undefined): ref is string {
  return !!ref && ref.startsWith(ASSET_PREFIX);
}

export function assetSrc(ref: string | undefined, projectDir: string | null): string | undefined {
  if (!ref) return undefined;
  if (!isAssetRef(ref)) return ref;
  if (!projectDir || !isDesktop()) return undefined;
  // The Rust side also refuses these; refusing here keeps the url inside the project.
  if (ref.split(/[\\/]/).includes("..")) return undefined;
  return desktop.fileUrl(joinPath(projectDir, ref));
}

const DATA_URL = /^data:([\w/+.-]+);base64,(.*)$/s;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

// Inline data URLs (browser uploads, imported JSON) become files in the project folder.
// `written` remembers source -> asset path per folder across saves of the same project so
// nothing is written twice.
export async function materializeAssets(project: Project, dir: string, written?: Map<string, string>): Promise<Project> {
  const presets = { ...project.presets };
  const images = { ...project.images };
  let changed = false;

  const store = async (source: string, name: string) => {
    const key = `${dir}\0${source}`;
    const known = written?.get(key);
    if (known) return known;
    const inline = source.match(DATA_URL)!;
    const rel = await desktop.writeAsset(dir, name, EXTENSIONS[inline[1]] ?? "bin", inline[2]);
    if (rel) written?.set(key, rel);
    return rel;
  };

  for (const preset of Object.values(presets)) {
    const source = preset.imageUrl;
    if (!source || !DATA_URL.test(source)) continue;
    const rel = await store(source, preset.name || preset.id);
    if (!rel) continue;
    presets[preset.id] = { ...preset, imageUrl: rel };
    changed = true;
  }
  for (const image of Object.values(images)) {
    if (!DATA_URL.test(image.src)) continue;
    const rel = await store(image.src, image.name?.replace(/\.[^.]+$/, "") || image.id);
    if (!rel) continue;
    images[image.id] = { ...image, src: rel };
    changed = true;
  }
  return changed ? { ...project, presets, images } : project;
}

// The reverse, for JSON that leaves the project folder: pictures travel inline.
// Attached documents stay behind; only their titles and external URLs are exported.
export async function inlineAssets(project: Project, dir: string): Promise<Project> {
  const presets = { ...project.presets };
  for (const preset of Object.values(presets)) {
    if (!isAssetRef(preset.imageUrl)) continue;
    presets[preset.id] = { ...preset, imageUrl: await readAsDataUrl(dir, preset.imageUrl) };
  }
  // A schematic picture whose file is gone has nothing left to show, so it is dropped.
  const images: Project["images"] = {};
  for (const image of Object.values(project.images)) {
    const src = isAssetRef(image.src) ? await readAsDataUrl(dir, image.src) : image.src;
    if (src) images[image.id] = { ...image, src };
  }
  return { ...project, presets, images };
}

async function readAsDataUrl(dir: string, rel: string): Promise<string | undefined> {
  try {
    const base64 = await desktop.readAssetBase64(dir, rel);
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    const mime = Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return `data:${mime};base64,${base64}`;
  } catch {
    return undefined;
  }
}
