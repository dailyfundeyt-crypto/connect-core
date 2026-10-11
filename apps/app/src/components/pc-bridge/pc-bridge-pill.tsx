import { cn } from "@/lib/utils";

/** Kleiner Punkt + Text: „PC online“ / „PC offline“. */
export function PcBridgePill({ online, label, className }: { online: boolean; label?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium",
        online ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-zinc-500/30 bg-zinc-500/10 text-muted-foreground",
        className,
      )}
      data-testid="pc-bridge-pill"
    >
      <span className={cn("size-2 rounded-full", online ? "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60" : "bg-zinc-500")} />
      {online ? "PC online" : "PC offline"}
      {label ? <span className="font-normal opacity-70">· {label}</span> : null}
    </span>
  );
}
