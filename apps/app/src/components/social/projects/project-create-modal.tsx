/**
 * Create Research Project Modal (Lane 6)
 *
 * Ermöglicht die Erstellung neuer dezentraler Forschungsprojekte:
 * - Titel, Beschreibung, Zielsetzung
 * - Kennzeichen: Gemeinnützig / Non-Profit
 * - GitHub-Repository-Anbindung
 * - Budget in Tokens
 */

import React, { useState } from "react";
import { IconBrandGithub, IconFlask, IconShieldCheck, IconX } from "@tabler/icons-react";

export function ProjectCreateModal({
  onClose,
  onSuccess,
  defaultCompanyId,
}: {
  onClose: () => void;
  onSuccess?: () => void;
  defaultCompanyId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [nonProfit, setNonProfit] = useState(true);
  const [category, setCategory] = useState("Biomedizin");
  const [budgetTokens, setBudgetTokens] = useState(10_000_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          goal,
          githubRepoUrl: githubRepoUrl.trim() || undefined,
          nonProfit,
          category,
          budgetTokens: Number(budgetTokens),
          companyId: defaultCompanyId,
          ownerId: "current-user",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Projekt-Erstellung fehlgeschlagen");
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Fehler beim Erstellen des Projekts");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconX className="size-5" />
        </button>

        <div className="flex items-center gap-2.5 text-primary">
          <IconFlask className="size-6" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Neues Forschungsprojekt anlegen
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Bots im Schwarm zerlegen dieses Ziel automatisch in kleinste nächste Schritte.
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Projekttitel
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              placeholder="z. B. Onkologie: Dezentrales KRAS G12D Screening"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Kurzbeschreibung
            </label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              placeholder="Worum geht es in diesem Projekt?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Konkretes Projektziel (für automatische Dekomposition)
            </label>
            <textarea
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              placeholder="z. B. Analyse von 10.000 Molekülverbindungen zur Validierung allosterischer Bindungstaschen."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Kategorie
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="Biomedizin">Biomedizin / Onkologie</option>
                <option value="Klimaforschung">Klimaforschung</option>
                <option value="Open-Source-Software">Open-Source-Software</option>
                <option value="Materialwissenschaft">Materialwissenschaft</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Token-Budget
              </label>
              <input
                type="number"
                step="1000000"
                value={budgetTokens}
                onChange={(e) => setBudgetTokens(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              GitHub Repository URL (Optional)
            </label>
            <div className="relative">
              <IconBrandGithub className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="url"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
                placeholder="https://github.com/org/repo"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="nonProfitCheck"
              checked={nonProfit}
              onChange={(e) => setNonProfit(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label
              htmlFor="nonProfitCheck"
              className="text-xs text-foreground flex items-center gap-1 cursor-pointer"
            >
              <IconShieldCheck className="size-3.5 text-emerald-500" />
              Gemeinnütziges Open-Source / Non-Profit Forschungsprojekt
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
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
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              {busy ? "Wird erstellt..." : "Projekt starten"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
