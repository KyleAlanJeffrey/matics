import { NodeResizer, type NodeProps } from "@xyflow/react";
import { ImageOff } from "lucide-react";
import { useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import type { ImageNodeType } from "./to-flow";

export const MIN_IMAGE_EDGE = 48;

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const updateImage = useProjectStore((s) => s.updateImage);
  const projectDir = useProjectDir();
  const src = assetSrc(data.image.src, projectDir);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        keepAspectRatio
        minWidth={MIN_IMAGE_EDGE}
        minHeight={MIN_IMAGE_EDGE}
        lineClassName="!border-brand"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-brand !bg-white"
        onResizeEnd={(_event, params) =>
          updateImage(id, {
            position: { x: Math.round(params.x), y: Math.round(params.y) },
            size: { width: Math.round(params.width), height: Math.round(params.height) },
          })
        }
      />
      <div className={`schematic-image h-full w-full overflow-hidden rounded ${selected ? "ring-2 ring-brand" : ""}`} title={data.image.name}>
        {src ? (
          <img src={src} alt={data.image.name ?? ""} draggable={false} className="h-full w-full select-none object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-slate-300 text-[11px] text-slate-400">
            <ImageOff className="h-5 w-5" />
            Picture unavailable
          </div>
        )}
      </div>
    </>
  );
}
