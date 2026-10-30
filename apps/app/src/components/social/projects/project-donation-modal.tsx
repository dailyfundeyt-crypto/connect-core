/**
 * Project Bot Donation Modal (Lane 6.3)
 *
 * Ermöglicht es Nutzern, eigene Bots an Forschungsprojekte zu spenden:
 * - Bot-Auswahl / Name
 * - Token- / Credit-Budget
 * - Max Tasks pro Tag (Schutz vor Überlastung)
 * - Spendenzeitraum
 */

import React, { useState } from "react";
import { IconCpu, IconHeartHandshake, IconX } from "@tabler/icons-react";

export function ProjectDonationModal({
  projectId,
  projectTitle,
  onClose,
  onSuccess,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [botName, setBotName] = useState("Forschungs-Worker-Alpha");
  const [budgetCredits, setBudgetCredits] = useState(1000);
  const [maxTasksPerDay, setMaxTasksPerDay] = useState(50);
  const [durationDays, setDurationDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: `donated-bot-${Date.now()}`,
          botName,
          budgetCredits: Number(budgetCredits),
          maxTasksPerDay: Number(maxTasksPerDay),
          durationDays: Number(durationDays),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Spende fehlgeschlagen");
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Fehler bei der Bot-Spende");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconX className="size-5" />
        </button>

        <div className="flex items-center gap-2.5 text-primary">
          <IconHeartHandshake className="size-6" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Bot für Forschung spenden
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Projekt: <strong className="text-foreground">{projectTitle}</strong>
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Bot Name
            </label>
            <input
              type="text"
              required
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              placeholder="z. B. Onkologie-Screening-Bot"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Credit-Budget
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={budgetCredits}
                onChange={(e) => setBudgetCredits(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Max Tasks / Tag
              </label>
              <input
                type="number"
                min="5"
                max="500"
                value={maxTasksPerDay}
                onChange={(e) => setMaxTasksPerDay(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Laufzeit (Tage)
            </label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
            >
              <option value={7}>7 Tage</option>
              <option value={14}>14 Tage</option>
              <option value={30}>30 Tage (Empfohlen)</option>
              <option value={90}>90 Tage</option>
            </select>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <IconCpu className="size-4 shrink-0 text-primary mt-0.5" />
            <span>
              Der gespendete Bot claimt automatisch freie Tasks des Projekts,
              führt diese isoliert aus und liefert verifizierbare Teilergebnisse.
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              <IconHeartHandshake className="size-4" />
              {busy ? "Wird gespendet..." : "Jetzt spenden"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
