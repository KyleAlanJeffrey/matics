import { useEffect, useRef, useState } from "react";

// Open state for a dropdown that closes on a click outside it or on Escape.
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

// Menus open from the dark app header, so the panel sets its own text color rather than
// inheriting the header's white.
export function MenuPanel({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div className={`absolute top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 text-slate-800 shadow-lg ${align === "left" ? "left-0" : "right-0"}`}>
      {children}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${danger ? "text-red-700 hover:bg-red-50" : "hover:bg-slate-50"}`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span>{label}</span>
      {hint && <span className="ml-auto pl-3 text-[10px] text-slate-400">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-slate-200" />;
}

export function MenuHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}
