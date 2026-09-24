import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/store/project-store";
import type { ZoneNodeType } from "./to-flow";

export function ZoneNode({ id, data, selected }: NodeProps<ZoneNodeType>) {
  const updateZone = useProjectStore((s) => s.updateZone);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-brand"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-brand !bg-white"
        onResizeEnd={(_event, params) =>
          updateZone(id, { position: { x: params.x, y: params.y }, size: { width: params.width, height: params.height } })
        }
      />
      <div
        className={`h-full w-full rounded-lg border transition-colors ${
          selected ? "border-brand bg-brand-wash/40" : "border-slate-300 bg-white/70"
        }`}
      >
        <div className="zone-title inline-block px-4 py-3 text-[17px] font-bold text-slate-900" title="Drag to move this zone and its devices">
          {data.zone.name}
        </div>
      </div>
    </>
  );
}
