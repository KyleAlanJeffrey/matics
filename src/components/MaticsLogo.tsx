// The Matics "Modules" symbol: two orange blocks, a central square and a tall block,
// separated by equal channels. On dark backgrounds the dark parts turn white and the
// orange stays.
export function MaticsMark({ inverse = false, className = "h-6 w-auto" }: { inverse?: boolean; className?: string }) {
  const dark = inverse ? "#ffffff" : "#22262a";
  return (
    <svg viewBox="0 0 46 41" className={className} role="img" aria-label="Matics">
      <g fill="#f26a21">
        <rect x="0" y="0" width="24" height="13" rx="1.6" />
        <rect x="0" y="0" width="15" height="18.5" rx="1.6" />
        <rect x="0" y="22.5" width="15" height="18.5" rx="1.6" />
        <rect x="0" y="28" width="24" height="13" rx="1.6" />
      </g>
      <g fill={dark}>
        <rect x="17.5" y="15.5" width="10" height="10" rx="1.2" />
        <rect x="30" y="4" width="16" height="33" rx="1.6" />
      </g>
    </svg>
  );
}

export function MaticsLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="flex items-center gap-2" aria-label="Matics">
      <MaticsMark inverse={inverse} className="h-6 w-auto" />
      <span className={`text-[22px] font-extrabold leading-none tracking-tight ${inverse ? "text-white" : "text-charcoal"}`}>matics</span>
    </span>
  );
}
