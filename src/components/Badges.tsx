// White on dark backgrounds, near-black on light ones (amber, green), so the small text
// stays readable whatever bus color is picked.
export function readableTextColor(background: string) {
  const hex = background.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#fff";
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.2 ? "#0f172a" : "#fff";
}

// Bus identifier pill in the bus color, e.g. "B1".
export function Tag({ color, children, size = "sm" }: { color: string; children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-bold ${size === "md" ? "px-2 py-0.5 text-[12px]" : "px-1 text-[9px] leading-[14px]"}`}
      style={{ background: color, color: readableTextColor(color) }}
    >
      {children}
    </span>
  );
}

// Variant badge tinted with the family color, e.g. "Classic" or "100BASE-TX".
export function VariantBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1 text-[9px] font-semibold leading-[14px]"
      style={{ background: `color-mix(in srgb, ${color} 12%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }}
    >
      {children}
    </span>
  );
}
