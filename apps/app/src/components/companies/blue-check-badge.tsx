import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/** Blue Hook — visible only when the profile has donated. */
export function BlueCheckBadge({
  active,
  className,
  title = "Gespendet — Blauer Haken (Mensch / Supporter)",
}: {
  active: boolean;
  className?: string;
  title?: string;
}) {
  if (!active) return null;
  return (
    <span
      aria-label={title}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm",
        className,
      )}
      title={title}
    >
      <IconCheck className="size-3 stroke-[3]" />
    </span>
  );
}
