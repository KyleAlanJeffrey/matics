import { Activity, CircleDot, Cpu, Gauge, ToggleLeft, Waves } from "lucide-react";
import { IO_KIND_BADGES } from "@/model/io";
import type { IoKind } from "@/model/types";

const KIND_STYLES: Record<IoKind, string> = {
  ai: "bg-teal-50 text-teal-700",
  ao: "bg-teal-50 text-teal-700",
  di: "bg-sky-50 text-sky-700",
  do: "bg-sky-50 text-sky-700",
  pwm: "bg-amber-50 text-amber-700",
  encoder: "bg-violet-50 text-violet-700",
  other: "bg-slate-100 text-slate-600",
};

const KIND_ICONS: Record<IoKind, typeof Activity> = {
  ai: Activity,
  ao: Activity,
  di: ToggleLeft,
  do: ToggleLeft,
  pwm: Waves,
  encoder: Gauge,
  other: CircleDot,
};

export function KindBadge({ kind }: { kind: IoKind }) {
  return <span className={`inline-flex rounded px-1.5 py-px text-[11px] font-semibold ${KIND_STYLES[kind]}`}>{IO_KIND_BADGES[kind]}</span>;
}

export function KindIcon({ kind, className = "h-4 w-4" }: { kind: IoKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={`${className} shrink-0 ${KIND_STYLES[kind].split(" ")[1]}`} />;
}

export function ControllerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <Cpu className={`${className} shrink-0 text-slate-500`} />;
}

export function NotSpecified() {
  return <span className="text-slate-400">Not specified</span>;
}
