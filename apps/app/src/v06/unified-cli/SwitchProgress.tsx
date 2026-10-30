/**
 * Fortschritt eines Anbieterwechsels und Hinweisbox bei fehlendem CLI-Broker (A15 / A37 Premium Design-Rollout).
 * Hinter FLAGS_V06.designV2: Obsidian-Tokens, Hairline-Borders, Card-Optik.
 */
import type { CliProviderId } from "@/contracts/v06/cli";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { CLI_BROKER_HELP_HREF, CLI_PROVIDER_LABELS } from "./unifiedCli";

export interface SwitchProgressProps {
  busy: boolean;
  pending: CliProviderId | null;
}

export function SwitchProgress({ busy, pending }: SwitchProgressProps) {
  if (!busy || !pending) return null;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div
        role="status"
        data-testid="switch-progress"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-1 text-xs text-[var(--p-text-2)] shadow-xs transition-all duration-180"
      >
        <span className="size-2 rounded-full bg-[var(--p-accent)] animate-ping" />
        <span>
          Wechsle zu <strong className="text-[var(--p-text-1)]">{CLI_PROVIDER_LABELS[pending]}</strong> – Gedächtnis wird übergeben …
        </span>
      </div>
    );
  }

  return (
    <div role="status" data-testid="switch-progress" className="px-3 py-1 text-xs text-sky-300">
      Wechsle zu {CLI_PROVIDER_LABELS[pending]} – Gedächtnis wird übergeben …
    </div>
  );
}

export interface BrokerNoticeProps {
  visible: boolean;
}

/** Ersetzt die Rohmeldung „CLI-Broker nicht gestartet" durch eine verständliche Hinweisbox. */
export function BrokerNotice({ visible }: BrokerNoticeProps) {
  if (!visible) return null;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div
        role="alert"
        data-testid="broker-notice"
        className="mx-3 my-2 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-[var(--p-text-1)] shadow-sm transition-all duration-180"
      >
        <div className="flex items-center gap-2 font-medium text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-400" />
          <span>Der CLI-Broker läuft nicht.</span>
        </div>
        <p className="mt-1 text-[var(--p-text-2)] leading-relaxed">
          Starte ihn einmal auf diesem PC (Skript <code className="rounded bg-[var(--p-surface-3)] px-1 py-0.5 text-[var(--p-text-1)] font-mono">scripts/v06/cli-broker-start.ps1</code>), danach erneut versuchen.
        </p>
        <a
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--p-accent)] hover:underline"
          href={CLI_BROKER_HELP_HREF}
          target="_blank"
          rel="noreferrer"
        >
          Hilfe zum CLI-Broker →
        </a>
      </div>
    );
  }

  return (
    <div role="alert" data-testid="broker-notice" className="mx-3 my-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
      <p className="font-medium">Der CLI-Broker läuft nicht.</p>
      <p className="mt-1">
        Starte ihn einmal auf diesem PC (Skript scripts/v06/cli-broker-start.ps1), danach erneut versuchen.
      </p>
      <a className="mt-1 inline-block underline" href={CLI_BROKER_HELP_HREF} target="_blank" rel="noreferrer">
        Hilfe zum CLI-Broker
      </a>
    </div>
  );
}
