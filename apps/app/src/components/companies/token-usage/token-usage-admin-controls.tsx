/**
 * Admin-Schalter des Token-Widgets (Lane A35).
 *
 * Nur für Firmen-Admins: „Öffentlich anzeigen“ (Opt-out) und „Kosten zeigen“.
 * Bewusst im Look der bestehenden Profil-Karte `SocialPublishCard` — kein neues Layout.
 *
 * Wichtig: Hier stehen ausschließlich Schalter. Die Erklärung „nur Summen, keine Inhalte“
 * steht sichtbar unter den Schaltern, damit die Entscheidung nachvollziehbar bleibt.
 */

import { IconEye, IconLock } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { CompanyUsageSettings } from "./types";

export type TokenUsageVisibilityKey = "public" | "showCost";

export type TokenUsageAdminControlsProps = {
  settings: CompanyUsageSettings | null;
  /** Speichert gerade (Schalter gesperrt). */
  busy?: boolean;
  /** Einstellungen werden geladen. */
  loading?: boolean;
  /** Nur Firmen-Admins sehen die Karte. */
  canManage?: boolean;
  error?: string | null;
  onToggle?: (key: TokenUsageVisibilityKey, value: boolean) => void;
  className?: string;
};

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-sky-500" : "bg-foreground/15",
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function TokenUsageAdminControls({
  settings,
  busy = false,
  loading = false,
  canManage = true,
  error = null,
  onToggle,
  className,
}: TokenUsageAdminControlsProps) {
  if (!canManage) return null;

  const isPublic = settings?.public ?? true;
  const showCost = settings?.showCost ?? false;
  const disabled = busy || loading || !settings;

  return (
    <div
      className={cn("rounded-2xl border border-border px-3.5 py-3", className)}
      data-testid="token-usage-admin"
    >
      <div className="flex items-center gap-2">
        <IconEye
          className={cn(
            "size-4 shrink-0",
            isPublic ? "text-sky-500" : "text-muted-foreground",
          )}
        />
        <p className="text-[14px] font-semibold">Token-Verbrauch im Profil</p>
      </div>

      <div className="mt-2.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Öffentlich anzeigen</p>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {isPublic
                ? "Dein Firmenprofil zeigt die Token-Summe der letzten 30 Tage."
                : "Der Verbrauch ist ausgeblendet — nur Firmen-Admins sehen ihn."}
            </p>
          </div>
          <Toggle
            checked={isPublic}
            disabled={disabled}
            label="Öffentlich anzeigen"
            onChange={(next) => onToggle?.("public", next)}
          />
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Kosten zeigen</p>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {isPublic
                ? "Betrag in USD neben den Tokens."
                : "Erst möglich, wenn der Verbrauch öffentlich ist."}
            </p>
          </div>
          <Toggle
            checked={showCost}
            disabled={disabled || !isPublic}
            label="Kosten zeigen"
            onChange={(next) => onToggle?.("showCost", next)}
          />
        </div>
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <IconLock className="mt-0.5 size-3 shrink-0" />
        <span>
          Nur Summen, keine Inhalte — keine Prompts, Antworten, Dateinamen,
          Agenten-Details oder Nutzer-IDs.
        </span>
      </p>

      {error ? (
        <p className="mt-1 text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
