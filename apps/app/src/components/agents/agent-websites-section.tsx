import {
  IconExternalLink,
  IconGlobe,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  AgentProfile,
  AgentWebsite,
} from "@/lib/agents/queries";
import { useAgentPatch } from "@/lib/agents/use-agent-patch";
import { cn } from "@/lib/utils";

export function normalizeWebsitesList(raw?: AgentWebsite[] | string[] | unknown[] | null): AgentWebsite[] {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!parsed || !Array.isArray(parsed)) return [];
  const list: AgentWebsite[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item === "string" && item.trim()) {
      const url = item.trim();
      const id = `web-${i + 1}-${encodeURIComponent(url.slice(0, 20)).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          url,
          purpose: "Allgemeine Web-Ressource",
          enabled: true,
        });
      }
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const rawUrl = typeof obj.url === "string" ? obj.url.trim() : "";
      if (!rawUrl) continue;

      const rawPurpose =
        typeof obj.purpose === "string"
          ? obj.purpose.trim()
          : typeof obj.wofuer === "string"
            ? obj.wofuer.trim()
            : typeof obj.description === "string"
              ? obj.description.trim()
              : "";

      const rawId = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
      const id =
        rawId ||
        `web-${i + 1}-${rawUrl
          .toLowerCase()
          .replace(/https?:\/\//, "")
          .replace(/[^a-z0-9_-]/g, "-")
          .slice(0, 30)}`;

      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          url: rawUrl,
          purpose: rawPurpose || "Kontext & Recherche",
          enabled: obj.enabled !== false,
          createdAt: typeof obj.createdAt === "string" ? obj.createdAt : undefined,
        });
      }
    }
  }

  return list;
}

/**
 * Vollständige Webseiten-Tabelle für den Agenten-Dialog (Phase C Schritt 13).
 */
export function AgentWebsitesSection({
  agentId: _agentId,
  websites: initialWebsites,
  canManage,
  onSave,
}: {
  agentId: string;
  websites?: AgentWebsite[] | null;
  canManage: boolean;
  onSave: (websites: AgentWebsite[]) => Promise<unknown>;
}) {
  const websites = normalizeWebsitesList(initialWebsites);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);

  const activeCount = websites.filter((w) => w.enabled).length;

  const handleToggle = async (siteId: string, currentEnabled: boolean) => {
    if (!canManage || saving) return;
    const next = websites.map((w) =>
      w.id === siteId ? { ...w, enabled: !currentEnabled } : w,
    );
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (siteId: string) => {
    if (!canManage || saving) return;
    const next = websites.filter((w) => w.id !== siteId);
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || saving) return;

    let cleanUrl = newUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const cleanPurpose = newPurpose.trim() || "Kontext & Recherche";
    const id = `web-${Date.now()}-${cleanUrl
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .slice(0, 30)}`;

    const newSite: AgentWebsite = {
      id,
      url: cleanUrl,
      purpose: cleanPurpose,
      enabled: newEnabled,
      createdAt: new Date().toISOString(),
    };

    const next = [...websites.filter((w) => w.id !== id), newSite];
    setSaving(true);
    try {
      await onSave(next);
      setNewUrl("");
      setNewPurpose("");
      setNewEnabled(true);
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const addPreset = async (url: string, purpose: string) => {
    if (!canManage || saving) return;
    const id = `web-preset-${Date.now()}-${url.replace(/[^a-z0-9]/gi, "").slice(0, 15)}`;
    const newSite: AgentWebsite = {
      id,
      url,
      purpose,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    const next = [...websites.filter((w) => w.url.toLowerCase() !== url.toLowerCase()), newSite];
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="agent-websites-section">
      {/* Kopfbereich mit Status und Erläuterung */}
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card/80 to-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <IconWorld className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Webseiten-Liste (Phase C Schritt 13)
                </h3>
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {activeCount} von {websites.length} aktiv
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tabelle URL + „wofür“; wird dem Agenten als Kontext mitgegeben (im Prompt und im Workspace als <code className="text-foreground font-mono text-[11px]">WEBSITES.md</code>).
              </p>
            </div>
          </div>

          {canManage && (
            <Button
              size="sm"
              variant={adding ? "outline" : "default"}
              onClick={() => setAdding(!adding)}
              type="button"
              className="gap-1.5 text-xs shrink-0"
            >
              {adding ? (
                <>
                  <IconX className="size-3.5" />
                  Abbrechen
                </>
              ) : (
                <>
                  <IconPlus className="size-3.5" />
                  Webseite hinzufügen
                </>
              )}
            </Button>
          )}
        </div>

        {/* Schnellauswahl / Presets */}
        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-border/50 text-xs">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">
              Häufige Vorlagen:
            </span>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={saving}
              onClick={() =>
                addPreset(
                  "https://connect-kunc-preview.vercel.app",
                  "Vorschau-Deployment prüfen und UI verifizieren",
                )
              }
              className="h-6 px-2 text-[11px] font-normal"
            >
              + Preview Vercel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={saving}
              onClick={() =>
                addPreset(
                  "https://workspace.google.com",
                  "dailyfunde.yt@gmail.com Google Workspace & Dokumente",
                )
              }
              className="h-6 px-2 text-[11px] font-normal"
            >
              + Google Workspace
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={saving}
              onClick={() =>
                addPreset(
                  "https://github.com",
                  "Quellcode-Repository, Commits & PRs",
                )
              }
              className="h-6 px-2 text-[11px] font-normal"
            >
              + GitHub Repo
            </Button>
          </div>
        )}
      </div>

      {/* Formular zum Hinzufügen */}
      {adding && canManage && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3 animate-in fade-in-50 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <IconPlus className="size-3.5 text-emerald-500" />
              Neue Webseite zum Kontext hinzufügen
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sofort aktiv:</span>
              <Switch
                checked={newEnabled}
                onCheckedChange={setNewEnabled}
                aria-label="Sofort aktivieren"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                URL <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="https://beispiel.de/portal"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                required
                className="text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Wofür / Zweck <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Z. B. Kundenportal für Recherchen"
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                required
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs"
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              variant="default"
              type="submit"
              disabled={saving || !newUrl.trim() || !newPurpose.trim()}
              className="text-xs"
            >
              {saving ? "Wird gespeichert…" : "Hinzufügen"}
            </Button>
          </div>
        </form>
      )}

      {/* Die geforderte Tabelle: URL + „wofür“ */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3.5 w-12 text-center">Aktiv</th>
                <th className="py-2.5 px-3.5 w-5/12">URL</th>
                <th className="py-2.5 px-3.5">Wofür / Zweck</th>
                {canManage && <th className="py-2.5 px-3.5 w-16 text-right">Aktion</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {websites.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 4 : 3}
                    className="py-8 text-center text-muted-foreground text-xs"
                  >
                    <IconGlobe className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                    Noch keine Webseiten konfiguriert. Klicke auf „Webseite hinzufügen“, um URLs als Arbeitskontext zu hinterlegen.
                  </td>
                </tr>
              ) : (
                websites.map((site) => (
                  <tr
                    key={site.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      !site.enabled && "opacity-60 bg-muted/10",
                    )}
                  >
                    {/* Aktiv-Schalter */}
                    <td className="py-2.5 px-3.5 text-center">
                      <Switch
                        checked={site.enabled}
                        disabled={!canManage || saving}
                        onCheckedChange={() => handleToggle(site.id, site.enabled)}
                        aria-label={`Webseite ${site.url} umschalten`}
                      />
                    </td>

                    {/* URL */}
                    <td className="py-2.5 px-3.5 font-mono text-[11.5px]">
                      <div className="flex items-center gap-1.5 max-w-[320px]">
                        <span className="truncate text-foreground font-medium select-all">
                          {site.url}
                        </span>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Im Browser öffnen"
                        >
                          <IconExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </td>

                    {/* Wofür / Zweck */}
                    <td className="py-2.5 px-3.5 text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 rounded-full shrink-0",
                            site.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                          )}
                        />
                        <span className="font-medium text-pretty">{site.purpose}</span>
                      </span>
                    </td>

                    {/* Aktionen (Löschen) */}
                    {canManage && (
                      <td className="py-2.5 px-3.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          disabled={saving}
                          onClick={() => handleDelete(site.id)}
                          title="Webseite entfernen"
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <IconTrash className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer-Info */}
        <div className="border-t border-border/60 bg-muted/20 px-3.5 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <IconShieldCheck className="size-3.5 text-emerald-500" />
            Wird dem Agenten als Kontext in <code className="text-foreground">WEBSITES.md</code> und in den System-Prompt injiziert.
          </span>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            {activeCount} aktiv
          </span>
        </div>
      </div>
    </div>
  );
}

/** The websites register of the agent dialog: the panel, wired to the shared profile save. */
export function AgentWebsitesRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const save = useAgentPatch(agentId, profile);

  return (
    <AgentWebsitesSection
      agentId={agentId}
      websites={profile.websiteList}
      canManage={profile.canManage}
      onSave={(websiteList) => save({ websiteList })}
    />
  );
}
