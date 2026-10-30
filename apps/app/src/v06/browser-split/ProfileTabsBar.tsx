import { IconBrandChrome, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { MAX_PROFILES_PER_AGENT } from "@/contracts/v06/browser-profiles";
import type { BrowserProfile } from "@/contracts/v06/browser-profiles";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { Button } from "@/v06/design/Button";

/**
 * Profil-Tabs oben. Jeder Tab = ein Nutzerprofil des Agenten (Farbe + Name),
 * „+“ legt ein neues an (deaktiviert bei 10 mit Tooltip) und
 * „Sitzung beenden“ schließt das aktive Profil nach Bestätigung.
 */
export function ProfileTabsBar({
  activeProfileId,
  creating,
  onEnd,
  onCreate,
  onSelect,
  profiles,
  ending,
}: {
  activeProfileId: string | null;
  creating?: boolean;
  ending?: boolean;
  onEnd: (profileId: string) => void;
  onCreate: (name: string) => void;
  onSelect: (profileId: string) => void;
  profiles: BrowserProfile[];
}) {
  const isDesignV2 = getFlag("designV2");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const atLimit = profiles.length >= MAX_PROFILES_PER_AGENT;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 px-3 py-1.5 transition-colors",
        isDesignV2
          ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] backdrop-blur-md"
          : "border-b border-border/60 bg-background/95 backdrop-blur",
      )}
      data-testid="profile-tabs-bar"
    >
      {profiles.map((profile) => {
        const active = profile.id === activeProfileId;
        return (
          <button
            className={cn(
              "group inline-flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 px-3 text-[12px] transition-all duration-[180ms]",
              isDesignV2
                ? active
                  ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border-strong)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)] font-medium"
                  : "rounded-[var(--p-radius-sm)] border border-transparent text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)]"
                : active
                  ? "rounded-full border border-border bg-background text-foreground shadow-sm"
                  : "rounded-full border border-transparent text-muted-foreground hover:bg-background/60",
            )}
            data-testid="profile-tab"
            data-profile-id={profile.id}
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            title={profile.name}
            type="button"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: profile.color || (isDesignV2 ? "var(--p-accent)" : "currentColor") }}
            />
            <span className="truncate">{profile.name}</span>
          </button>
        );
      })}

      {/* „+“ legt ein neues Profil an — deaktiviert bei MAX_PROFILES_PER_AGENT. */}
      {composerOpen ? (
        <form
          className="flex h-7 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draftName.trim();
            if (!name) return;
            onCreate(name);
            setDraftName("");
            setComposerOpen(false);
          }}
        >
          <input
            autoFocus
            className={cn(
              "h-6 w-32 px-2 text-[12px] outline-none transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-border-focus)]"
                : "rounded-full border border-border bg-background",
            )}
            data-testid="new-profile-name"
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Profil-Name"
            value={draftName}
          />
          <button
            className={cn(
              "text-[11px] transition-colors",
              isDesignV2
                ? "font-medium text-[var(--p-accent)] hover:text-[var(--p-accent-hover)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="new-profile-submit"
            type="submit"
          >
            Anlegen
          </button>
          <button
            className={cn(
              "text-[11px] transition-colors",
              isDesignV2
                ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setComposerOpen(false)}
            type="button"
          >
            Abbrechen
          </button>
        </form>
      ) : (
        <button
          aria-label="Neues Browser-Profil anlegen"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-transparent text-[var(--p-text-3)] hover:border-[var(--p-border)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)]"
              : "rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
          data-testid="new-profile-button"
          disabled={atLimit || creating}
          onClick={() => setComposerOpen(true)}
          title={
            atLimit
              ? `Maximal ${MAX_PROFILES_PER_AGENT} Profile pro Agent`
              : "Neues Profil anlegen"
          }
          type="button"
        >
          <IconPlus className="size-3.5" />
        </button>
      )}

      <span className="flex-1" />

      {confirmingEnd ? (
        <span
          className={cn(
            "flex items-center gap-1.5",
            isDesignV2 && "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] px-2 py-0.5",
          )}
          data-testid="end-session-confirm"
        >
          <span
            className={cn(
              "text-[11px]",
              isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
            )}
          >
            Sitzung wirklich beenden?
          </span>
          <button
            className={cn(
              "px-2.5 py-0.5 text-[11px] transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-xs)] bg-[var(--p-danger)] text-white hover:bg-[var(--p-danger-hover)] font-medium"
                : "rounded-full bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300",
            )}
            data-testid="end-session-confirm-yes"
            disabled={ending}
            onClick={() => {
              setConfirmingEnd(false);
              if (activeProfileId) onEnd(activeProfileId);
            }}
            type="button"
          >
            Beenden
          </button>
          <button
            className={cn(
              "px-2 py-0.5 text-[11px] transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-xs)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                : "rounded-full text-muted-foreground hover:text-foreground",
            )}
            data-testid="end-session-confirm-no"
            onClick={() => setConfirmingEnd(false)}
            type="button"
          >
            Abbrechen
          </button>
        </span>
      ) : (
        <button
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-transparent text-[var(--p-text-2)] hover:border-[var(--p-danger-subtle)] hover:bg-[var(--p-danger-subtle)] hover:text-[var(--p-danger)]"
              : "rounded-full border border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          )}
          data-testid="end-session-button"
          disabled={!activeProfileId || ending}
          onClick={() => setConfirmingEnd(true)}
          type="button"
        >
          <IconBrandChrome className="size-3.5" />
          Sitzung beenden
        </button>
      )}
    </div>
  );
}
