/**
 * Model One Settings-Panel.
 *
 * Phase 1 Scope:
 *  - Anzeige: Antigravity-Login-Status (read from /api/cli-bridge/status oder direkt prüfen)
 *  - Read-only: "Model One läuft auf Antigravity (agy)"
 *  - Aktion: Reset-Button für Usage-Stats
 *
 * Phase 2 erweitert um:
 *  - Manus-Email/PW Felder
 *  - Perplexity-Account
 *  - Subagent-Auswahl
 */
import { Button } from "@/components/ui/button";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { tryClient } from "@/lib/client";
import { useState } from "react";

type AntigravityStatus = { installed: boolean; loggedIn: boolean | null; detail: string; version: string | null } | null;

export function ModelOnePanel() {
  const [status, setStatus] = useState<AntigravityStatus>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const response = await tryClient("/api/cli-bridge/status?kind=antigravity");
      if (!response.ok) return;
      const body = (await response.json()) as { status?: AntigravityStatus };
      setStatus(body.status ?? null);
    } catch {
      // ignore
    }
  }

  async function resetUsage() {
    setResetting(true);
    setResetMessage(null);
    try {
      const response = await tryClient("/api/model-one/reset", { method: "POST" });
      if (response.ok) setResetMessage("✓ Usage zurückgesetzt.");
      else setResetMessage("Fehler beim Zurücksetzen.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <PageSection>
      <SettingsSectionHeader
        title="Model One"
        description="Zentraler Orchestrator-Agent. Läuft auf Antigravity (agy). Browser-Aufgaben gehen an den Browser-Subagenten."
      />
      <PageRows>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-100">Antigravity-Status</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Model One nutzt die Antigravity-CLI (agy). Der Login läuft über deinen Google-Account, keine API-Keys.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              Status prüfen
            </Button>
            {status ? (
              <span className={`text-xs ${status.loggedIn ? "text-green-400" : "text-amber-400"}`}>
                {status.installed
                  ? status.loggedIn
                    ? `✓ Angemeldet (${status.version ?? "?"})`
                    : "⚠ Nicht angemeldet"
                  : "✗ Nicht installiert"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-100">Usage zurücksetzen</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Token-Zähler und Call-Stats für Model One auf Null setzen.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void resetUsage()} disabled={resetting}>
              {resetting ? "…" : "Reset"}
            </Button>
            {resetMessage ? <span className="text-xs text-zinc-400">{resetMessage}</span> : null}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-100">Hinweis</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Model One öffnest du unter{" "}
            <a href="/model-one" className="text-blue-400 hover:underline">
              /model-one
            </a>
            . Das rechte Usage-Panel zeigt Live-Token-Verbrauch und Call-Statistiken. Manus- und Perplexity-Anbindung kommen in Phase 2.
          </p>
        </div>
      </PageRows>
    </PageSection>
  );
}
