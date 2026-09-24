import type { ReactNode } from "react";
import type { Thumbnail } from "./thumbnail";

const LABEL_PX = 9;
// Height of a device card's title band, in diagram units.
const CARD_HEADER = 34;

// The title band: rounded along the top only, so it sits flush inside the card.
function headerPath({ x, y, width }: { x: number; y: number; width: number }, height: number, r: number) {
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

// `width` and `height` are the drawn size in CSS pixels, which decides where a label is
// big enough to read.
export function SchematicThumbnail({ thumbnail, width, height, empty }: { thumbnail: Thumbnail | null | undefined; width: number; height: number; empty?: ReactNode }) {
  return (
    <div className="thumbnail-grid shrink-0 overflow-hidden rounded-md border border-slate-200" style={{ width, height }}>
      {thumbnail ? (
        <Drawing thumbnail={thumbnail} width={width} height={height} />
      ) : (
        // A list row's preview is too small for the label.
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-slate-400">{thumbnail === undefined || height < 64 ? null : empty}</div>
      )}
    </div>
  );
}

function Drawing({ thumbnail, width, height }: { thumbnail: Thumbnail; width: number; height: number }) {
  const { box } = thumbnail;
  const scale = Math.min(width / box.width, height / box.height);
  const px = (n: number) => n / scale;
  const fits = (text: string, room: number) => text.length * LABEL_PX * 0.56 + 8 <= room * scale;

  return (
    <svg width={width} height={height} viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} aria-hidden>
      {thumbnail.zones.map((zone, i) => (
        <g key={`z${i}`}>
          <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={px(3)} fill="#f5f5f2" stroke="#d0d2cf" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {fits(zone.name, zone.width) && (
            <text x={zone.x + px(5)} y={zone.y + px(11)} fontSize={px(LABEL_PX)} fontWeight={600} fill="#464c52">
              {zone.name}
            </text>
          )}
        </g>
      ))}
      {thumbnail.images.map((image, i) => (
        <rect key={`i${i}`} x={image.x} y={image.y} width={image.width} height={image.height} fill="#eeeeeb" stroke="#d0d2cf" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {thumbnail.wires.map((wire, i) => (
        <polyline
          key={`w${i}`}
          points={wire.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={wire.color}
          strokeWidth={1.25}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {thumbnail.buses.map((bus, i) => (
        <line key={`b${i}`} x1={bus.x} x2={bus.x} y1={bus.top} y2={bus.bottom} stroke={bus.color} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {thumbnail.devices.map((device, i) => (
        <g key={`d${i}`}>
          <rect x={device.x} y={device.y} width={device.width} height={device.height} rx={px(2.5)} fill="#ffffff" />
          <path d={headerPath(device, CARD_HEADER, px(2.5))} fill="#eeeeeb" />
          <rect x={device.x} y={device.y} width={device.width} height={device.height} rx={px(2.5)} fill="none" stroke="#a2a7ab" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {fits(device.name, device.width) && (
            <text x={device.x + device.width / 2} y={device.y + device.height / 2 + px(3)} fontSize={px(LABEL_PX)} fontWeight={600} fill="#30353a" textAnchor="middle">
              {device.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
