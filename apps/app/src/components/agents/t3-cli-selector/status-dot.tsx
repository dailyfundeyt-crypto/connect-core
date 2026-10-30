/**
 * T3-Bridge — Status-Punkt Komponente (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Visuelle Darstellung des Status-Punkts:
 *  - Bereit: Grün (emerald-500)
 *  - Nicht eingeloggt: Gelb/Orange (amber-500)
 *  - Limit: Rot (rose-500)
 *  - Nicht verfügbar: Grau (muted-foreground/40)
 */

import { cn } from "@/lib/utils";
import { STATUS_DOT_COLORS, type T3CliStatus } from "./status";

export function StatusDot({
  status,
  title,
  className,
}: {
  status: T3CliStatus;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full transition-colors",
        STATUS_DOT_COLORS[status],
        className,
      )}
      title={title}
      data-testid="t3-cli-status-dot"
      data-status={status}
      aria-hidden="true"
    />
  );
}
