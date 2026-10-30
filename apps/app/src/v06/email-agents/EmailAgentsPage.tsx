/**
 * Verzeichnis-Seite fuer externe E-Mail-Bots v06 (A19).
 *
 * Zeigt Adresse, Name, Beschreibung (was der Bot tut), Faehigkeiten und Firmen.
 * Anlegen nur mit Pflicht-Beschreibung. Flag: FLAGS_V06.emailAgents (Default: aus).
 * Routing-/Sidebar-Wiring macht der Integrations-Agent A22 (Wiring-Bedarf im Bericht).
 */

import { useState } from "react";
import {
  IconAlertCircle,
  IconMail,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getFlag } from "@/contracts/v06/flags";
import type { EmailAgent } from "@/contracts/v06/email-agents";
import { EmptyState, Skeleton } from "@/v06/design";
import { useEmailAgents, validateAgentDraft } from "./useEmailAgents";

export interface EmailAgentsPageProps {
  /** Overrides the flag check (fuer Tests/Preview). */
  featureEnabled?: boolean;
}

export function EmailAgentsPage(props: EmailAgentsPageProps = {}) {
  const featureEnabled = props.featureEnabled ?? getFlag("emailAgents");

  if (!featureEnabled) {
    return <FlagDisabledCard />;
  }

  return <EmailAgentsDirectory />;
}

function FlagDisabledCard() {
  const isDesignV2 = Boolean(getFlag("designV2"));
  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto p-5 text-sm",
        isDesignV2
          ? "rounded-[var(--p-radius-xl)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] shadow-xs"
          : "rounded-xl border border-border bg-card/60 text-muted-foreground",
      )}
      data-testid="email-agents-disabled"
    >
      <div className="flex items-start gap-2.5">
        <IconAlertCircle className="size-5 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="space-y-1">
          <p className={cn("font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>E-Mail-Agenten</p>
          <p>
            Das Feature <code className="text-xs">emailAgents</code> ist deaktiviert (FLAG{" "}
            <code className="text-xs">FLAGS_V06.emailAgents</code>, Standard: aus). Externe
            E-Mail-Bots verwalten und der Freigabe-Warteschlange erscheinen, sobald das
            Feature aktiviert wird.
          </p>
        </div>
      </div>
    </div>
  );
}

const emptyDraft = {
  address: "",
  name: "",
  description: "",
  capabilities: "",
};

function EmailAgentsDirectory() {
  const isDesignV2 = Boolean(getFlag("designV2"));
  const { agents, isLoading, error, reload, createAgent } = useEmailAgents();
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setFormError(null);
    const invalid = validateAgentDraft({
      address: draft.address,
      name: draft.name,
      description: draft.description,
    });
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSaving(true);
    try {
      await createAgent({
        address: draft.address,
        name: draft.name,
        description: draft.description,
        capabilities: draft.capabilities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setDraft(emptyDraft);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6" data-testid="email-agents-page">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <IconMail className={cn("size-5", isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground")} />
          <div>
            <h2 className={cn("text-base font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>E-Mail-Agenten</h2>
            <p className={cn("text-sm", isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground")}>
              Verzeichnis externer E-Mail-Bots. Connect-Agenten beauftragen sie per
              E-Mail – der Versand läuft über den eigenen Account und geschieht{" "}
              <span className={cn("font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>nur nach Freigabe</span>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors",
            isDesignV2
              ? "min-h-[44px] px-4 py-2 rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] font-semibold"
              : "rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:text-foreground",
          )}
        >
          <IconRefresh className="size-4" />
          Aktualisieren
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Anlage: Bot ins Verzeichnis aufnehmen */}
      <section
        className={cn(
          "space-y-3",
          isDesignV2
            ? "rounded-[var(--p-radius-xl)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-5 shadow-xs"
            : "rounded-xl border border-border bg-card/60 p-4",
        )}
      >
        <h3 className={cn("text-sm font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>Bot aufnehmen</h3>
        {formError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
            {formError}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            placeholder="E-Mail-Adresse (z.B. research-bot@example.com)"
            className={cn(
              "w-full text-sm transition-colors",
              isDesignV2
                ? "min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] px-3.5 text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:outline-none"
                : "h-9 rounded-lg border border-border bg-background px-3",
            )}
            data-testid="email-agent-input-address"
          />
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className={cn(
              "w-full text-sm transition-colors",
              isDesignV2
                ? "min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] px-3.5 text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:outline-none"
                : "h-9 rounded-lg border border-border bg-background px-3",
            )}
            data-testid="email-agent-input-name"
          />
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Was tut dieser Bot? (Pflichtfeld – wird auch Grok Bot über den Connect-MCP angezeigt)"
          rows={3}
          className={cn(
            "w-full text-sm transition-colors",
            isDesignV2
              ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] p-3.5 text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:outline-none"
              : "rounded-lg border border-border bg-background px-3 py-2",
          )}
          data-testid="email-agent-input-description"
        />
        <input
          value={draft.capabilities}
          onChange={(e) => setDraft({ ...draft, capabilities: e.target.value })}
          placeholder="Fähigkeiten (Komma-getrennt, z.B. Recherche, Zusammenfassen)"
          className={cn(
            "w-full text-sm transition-colors",
            isDesignV2
              ? "min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] px-3.5 text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:outline-none"
              : "h-9 rounded-lg border border-border bg-background px-3",
          )}
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium transition-all",
              isDesignV2
                ? "min-h-[44px] px-6 py-2.5 rounded-full bg-[var(--p-accent)] text-zinc-950 font-bold hover:bg-[var(--p-accent)]/90 shadow-sm active:scale-95 disabled:opacity-50"
                : "rounded-lg bg-primary px-3.5 py-1.5 text-primary-foreground disabled:opacity-60",
            )}
          >
            <IconPlus className="size-4" />
            Aufnehmen
          </button>
        </div>
      </section>

      {/* Verzeichnisliste */}
      <section className="space-y-3">
        {isLoading ? (
          isDesignV2 ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-[var(--p-radius-xl)] bg-[var(--p-surface-2)] border border-[var(--p-border)] flex items-start gap-3">
                  <Skeleton variant="rect" width={40} height={40} className="rounded-[var(--p-radius-md)] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="40%" height={14} />
                    <Skeleton variant="text" width="25%" height={10} />
                    <Skeleton variant="text" width="80%" height={12} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Lade Verzeichnis…
            </div>
          )
        ) : agents.length === 0 ? (
          isDesignV2 ? (
            <EmptyState
              icon={<IconMail className="size-6 text-[var(--p-accent)]" />}
              title="Noch keine E-Mail-Bots"
              description="In diesem Workspace sind noch keine externen E-Mail-Bots eingetragen. Nehmen Sie oben einen neuen Bot auf."
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Noch keine E-Mail-Bots im Verzeichnis.
            </div>
          )
        ) : (
          agents.map((agent) => <EmailAgentCard key={agent.id} agent={agent} isDesignV2={isDesignV2} />)
        )}
      </section>
    </div>
  );
}

interface EmailAgentCardProps {
  agent: EmailAgent;
  isDesignV2?: boolean;
}

/** Kartenansicht des Bots mit Primaerzeichen als Fallback. */
function EmailAgentCard({ agent, isDesignV2 }: EmailAgentCardProps) {
  const initial = agent.name?.charAt(0)?.toUpperCase() || "B";
  return (
    <article
      className={cn(
        "p-4 transition-colors",
        isDesignV2
          ? "rounded-[var(--p-radius-xl)] border border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/40 shadow-xs"
          : "rounded-xl border border-border bg-card/60",
      )}
      data-testid="email-agent-card"
      data-agent-id={agent.id}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center font-bold text-sm",
            isDesignV2
              ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-3)] border border-[var(--p-border)] text-[var(--p-accent)]"
              : "rounded-lg bg-muted text-foreground/80",
          )}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium truncate", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>{agent.name}</p>
          <p className={cn("text-xs truncate", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>{agent.address}</p>
          <p className={cn("mt-1.5 text-sm", isDesignV2 ? "text-[var(--p-text-2)]" : "text-foreground/80")}>{agent.description}</p>
          {agent.capabilities.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className={cn(
                    "text-xs",
                    isDesignV2
                      ? "rounded-full border border-[var(--p-border)] bg-[var(--p-surface-3)] px-2.5 py-0.5 text-[var(--p-text-2)]"
                      : "rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground",
                  )}
                >
                  {cap}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
