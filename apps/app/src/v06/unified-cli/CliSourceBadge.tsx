/**
 * Kleines Terminal-Icon für CLI-Nachrichten im Chat-Verlauf (A15 / A37 Premium Design-Rollout).
 * Hinter FLAGS_V06.designV2: Obsidian-Tokens, Hairline-Borders.
 */
import { IconTerminal2 } from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { isCliMessage } from "./unifiedCli";

export function CliSourceBadge({ source }: { source: "chat" | "cli" }) {
  if (!isCliMessage({ source })) return null;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <span
        title="Aus dem CLI-Terminal"
        aria-label="Aus dem CLI-Terminal"
        data-testid="cli-source-badge"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-2)] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:border-[var(--p-border-strong)] transition-colors duration-150"
      >
        <IconTerminal2 className="size-3 text-[var(--p-accent)]" />
        <span>CLI</span>
      </span>
    );
  }

  return (
    <span
      title="Aus dem CLI-Terminal"
      aria-label="Aus dem CLI-Terminal"
      data-testid="cli-source-badge"
      className="inline-flex items-center text-muted-foreground"
    >
      <IconTerminal2 className="size-3" />
    </span>
  );
}
