import {
  IconCheck,
  IconExternalLink,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconShieldCheck,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  AgentProfile,
  AgentSubagent,
} from "@/lib/agents/queries";
import { useAgentPatch } from "@/lib/agents/use-agent-patch";
import { cn } from "@/lib/utils";

/**
 * Startwerte gemäß Anforderung (Phase C Schritt 14):
 * - Manus (manus.im/app, komplexe Browsernutzung)
 * - Perplexity Computer (perplexity.ai/computer, Recherche)
 * - Ottermind (ottermind.ai/studio/task, Datenauswertung)
 * - Lovable (lovable.dev/dashboard, Landing Pages)
 */
export const DEFAULT_SUBAGENTS_PRESETS: AgentSubagent[] = [
  {
    id: "subagent-manus",
    name: "Manus",
    url: "https://manus.im/app",
    description: "komplexe Browsernutzung",
    enabled: true,
  },
  {
    id: "subagent-perplexity-computer",
    name: "Perplexity Computer",
    url: "https://perplexity.ai/computer",
    description: "Recherche",
    enabled: true,
  },
  {
    id: "subagent-ottermind",
    name: "Ottermind",
    url: "https://ottermind.ai/studio/task",
    description: "Datenauswertung",
    enabled: true,
  },
  {
    id: "subagent-lovable",
    name: "Lovable",
    url: "https://lovable.dev/dashboard",
    description: "Landing Pages",
    enabled: true,
  },
];

export function normalizeSubagentsList(
  raw?: AgentSubagent[] | unknown[] | null,
): AgentSubagent[] {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return DEFAULT_SUBAGENTS_PRESETS.map((item) => ({ ...item }));
    }
  }

  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return DEFAULT_SUBAGENTS_PRESETS.map((item) => ({ ...item }));
  }

  const list: AgentSubagent[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item === "string" && item.trim()) {
      const name = item.trim();
      const id = `subagent-${i + 1}-${encodeURIComponent(name.slice(0, 20)).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          name,
          url: "https://" + name.toLowerCase().replace(/[^a-z0-9.-]/g, "") + ".ai",
          description: "Online-KI-Subagent",
          enabled: true,
        });
      }
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const rawName = typeof obj.name === "string" ? obj.name.trim() : "";
      let rawUrl =
        typeof obj.url === "string"
          ? obj.url.trim()
          : typeof obj.link === "string"
            ? obj.link.trim()
            : "";
      if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }

      const rawDesc =
        typeof obj.description === "string"
          ? obj.description.trim()
          : typeof obj.beschreibung === "string"
            ? obj.beschreibung.trim()
            : typeof obj.purpose === "string"
              ? obj.purpose.trim()
              : "";

      if (!rawName && !rawUrl) continue;

      const effectiveName = rawName || rawUrl.replace(/^https?:\/\//, "").split("/")[0];
      const rawId = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
      const id =
        rawId ||
        `subagent-${i + 1}-${effectiveName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 30)}`;

      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          name: effectiveName,
          url: rawUrl || "https://example.com",
          description: rawDesc || "Spezialisierte Online-KI",
          enabled: obj.enabled !== false,
          createdAt: typeof obj.createdAt === "string" ? obj.createdAt : undefined,
        });
      }
    }
  }

  if (list.length === 0) {
    return DEFAULT_SUBAGENTS_PRESETS.map((item) => ({ ...item }));
  }

  return list;
}

/**
 * Vollständige Subagenten-Liste (Online-KIs) für den Agenten-Dialog (Phase C Schritt 14).
 * Name, Link, Beschreibung, editierbar.
 */
export function AgentSubagentsSection({
  agentId: _agentId,
  subagents: initialSubagents,
  canManage,
  onSave,
}: {
  agentId: string;
  subagents?: AgentSubagent[] | null;
  canManage: boolean;
  onSave: (subagents: AgentSubagent[]) => Promise<unknown>;
}) {
  const subagents = normalizeSubagentsList(initialSubagents);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formular-Felder für Hinzufügen / Bearbeiten
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const activeCount = subagents.filter((s) => s.enabled).length;

  const handleToggle = async (subagentId: string, currentEnabled: boolean) => {
    if (!canManage || saving) return;
    const next = subagents.map((s) =>
      s.id === subagentId ? { ...s, enabled: !currentEnabled } : s,
    );
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subagentId: string) => {
    if (!canManage || saving) return;
    const next = subagents.filter((s) => s.id !== subagentId);
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (sub: AgentSubagent) => {
    setEditingId(sub.id);
    setFormName(sub.name);
    setFormUrl(sub.url);
    setFormDesc(sub.description);
    setFormEnabled(sub.enabled);
    setAdding(false);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setFormName("");
    setFormUrl("");
    setFormDesc("");
    setFormEnabled(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || saving) return;

    let cleanUrl = formUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const cleanName = formName.trim();
    const cleanDesc = formDesc.trim() || "Online-KI-Subagent";

    let next: AgentSubagent[];

    if (editingId) {
      // Editieren
      next = subagents.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: cleanName,
              url: cleanUrl || s.url,
              description: cleanDesc,
              enabled: formEnabled,
            }
          : s,
      );
    } else {
      // Neu anlegen
      const id = `subagent-${Date.now()}-${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 25)}`;
      const newSubagent: AgentSubagent = {
        id,
        name: cleanName,
        url: cleanUrl || "https://example.com",
        description: cleanDesc,
        enabled: formEnabled,
        createdAt: new Date().toISOString(),
      };
      next = [...subagents.filter((s) => s.id !== id), newSubagent];
    }

    setSaving(true);
    try {
      await onSave(next);
      cancelForm();
    } finally {
      setSaving(false);
    }
  };

  const addPreset = async (preset: AgentSubagent) => {
    if (!canManage || saving) return;
    const next = [
      ...subagents.filter(
        (s) => s.name.toLowerCase() !== preset.name.toLowerCase(),
      ),
      { ...preset, id: `subagent-${Date.now()}-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, "")}` },
    ];
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!canManage || saving) return;
    const next = DEFAULT_SUBAGENTS_PRESETS.map((item) => ({ ...item }));
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="agent-subagents-section">
      {/* Kopfbereich mit Status und Erläuterung */}
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card/80 to-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <IconRobot className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Subagenten (Online-KIs) (Phase C Schritt 14)
                </h3>
                <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                  {activeCount} von {subagents.length} aktiv
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Liste mit Name, Link und Beschreibung (editierbar). Wird dem Agenten im Prompt und im Workspace als <code className="text-foreground font-mono text-[11px]">SUBAGENTS.md</code> bereitgestellt.
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={resetToDefaults}
                disabled={saving}
                type="button"
                className="gap-1.5 text-xs h-8"
                title="Setzt die Liste auf die 4 Startwerte zurück"
              >
                <IconRefresh className="size-3.5" />
                Startwerte laden
              </Button>
              <Button
                size="sm"
                variant={adding ? "outline" : "default"}
                onClick={() => {
                  if (adding) {
                    cancelForm();
                  } else {
                    setEditingId(null);
                    setFormName("");
                    setFormUrl("");
                    setFormDesc("");
                    setFormEnabled(true);
                    setAdding(true);
                  }
                }}
                type="button"
                className="gap-1.5 text-xs h-8"
              >
                {adding ? (
                  <>
                    <IconX className="size-3.5" />
                    Abbrechen
                  </>
                ) : (
                  <>
                    <IconPlus className="size-3.5" />
                    Subagent hinzufügen
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Schnellauswahl / Startwerte-Presets */}
        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-border/50 text-xs">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">
              Startwerte-Schnellwahl:
            </span>
            {DEFAULT_SUBAGENTS_PRESETS.map((preset) => {
              const alreadyIn = subagents.some(
                (s) => s.name.toLowerCase() === preset.name.toLowerCase(),
              );
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="secondary"
                  type="button"
                  disabled={saving || alreadyIn}
                  onClick={() => addPreset(preset)}
                  className="h-6 px-2 text-[11px] font-normal"
                  title={`${preset.name}: ${preset.description} (${preset.url})`}
                >
                  {alreadyIn ? <IconCheck className="size-3 mr-1 text-emerald-500" /> : "+ "}
                  {preset.name}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Formular zum Hinzufügen oder Editieren */}
      {(adding || editingId) && canManage && (
        <form
          onSubmit={handleFormSubmit}
          className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4 space-y-3 animate-in fade-in-50 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              {editingId ? (
                <>
                  <IconPencil className="size-3.5 text-sky-500" />
                  Subagent bearbeiten
                </>
              ) : (
                <>
                  <IconPlus className="size-3.5 text-sky-500" />
                  Neuen Online-KI-Subagenten hinzufügen
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Aktiv:</span>
              <Switch
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
                aria-label="Aktivieren"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Z. B. Manus, Perplexity Computer"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="text-xs font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Link / URL <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="https://manus.im/app"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                required
                className="text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Beschreibung / Spezialisierung <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Z. B. komplexe Browsernutzung, Recherche"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
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
              onClick={cancelForm}
              className="text-xs"
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              variant="default"
              type="submit"
              disabled={saving || !formName.trim() || !formUrl.trim()}
              className="text-xs"
            >
              {saving ? "Wird gespeichert…" : editingId ? "Änderungen übernehmen" : "Hinzufügen"}
            </Button>
          </div>
        </form>
      )}

      {/* Editierbare Tabelle mit Name, Link, Beschreibung */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3.5 w-12 text-center">Aktiv</th>
                <th className="py-2.5 px-3.5 w-3/12">Name</th>
                <th className="py-2.5 px-3.5 w-4/12">Link / Portal</th>
                <th className="py-2.5 px-3.5">Beschreibung / Spezialisierung</th>
                {canManage && <th className="py-2.5 px-3.5 w-24 text-right">Aktionen</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {subagents.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 5 : 4}
                    className="py-8 text-center text-muted-foreground text-xs"
                  >
                    <IconRobot className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                    Noch keine Subagenten konfiguriert. Klicke auf „Startwerte laden“, um Manus, Perplexity, Ottermind und Lovable anzulegen.
                  </td>
                </tr>
              ) : (
                subagents.map((sub) => (
                  <tr
                    key={sub.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      !sub.enabled && "opacity-60 bg-muted/10",
                      editingId === sub.id && "bg-sky-500/10",
                    )}
                  >
                    {/* Aktiv-Schalter */}
                    <td className="py-2.5 px-3.5 text-center">
                      <Switch
                        checked={sub.enabled}
                        disabled={!canManage || saving}
                        onCheckedChange={() => handleToggle(sub.id, sub.enabled)}
                        aria-label={`Subagent ${sub.name} umschalten`}
                      />
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            sub.enabled ? "bg-sky-500" : "bg-muted-foreground/40",
                          )}
                        />
                        <span className="font-semibold text-foreground text-[12px]">
                          {sub.name}
                        </span>
                      </div>
                    </td>

                    {/* Link */}
                    <td className="py-2.5 px-3.5 font-mono text-[11.5px]">
                      <div className="flex items-center gap-1.5 max-w-[280px]">
                        <span className="truncate text-foreground select-all">
                          {sub.url}
                        </span>
                        <a
                          href={sub.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Portal im Browser öffnen"
                        >
                          <IconExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </td>

                    {/* Beschreibung / Spezialisierung */}
                    <td className="py-2.5 px-3.5 text-foreground">
                      <span className="font-medium text-pretty">{sub.description}</span>
                    </td>

                    {/* Aktionen (Editieren & Löschen) */}
                    {canManage && (
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            disabled={saving}
                            onClick={() => startEdit(sub)}
                            title="Subagent bearbeiten"
                            className="size-7 text-muted-foreground hover:text-foreground"
                          >
                            <IconPencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            disabled={saving}
                            onClick={() => handleDelete(sub.id)}
                            title="Subagent entfernen"
                            className="size-7 text-muted-foreground hover:text-destructive"
                          >
                            <IconTrash className="size-3.5" />
                          </Button>
                        </div>
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
            <IconShieldCheck className="size-3.5 text-sky-500" />
            Wird dem Agenten als Kontext in <code className="text-foreground">SUBAGENTS.md</code> und in den System-Prompt injiziert.
          </span>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            {activeCount} aktiv
          </span>
        </div>
      </div>
    </div>
  );
}

/** The subagents register of the agent dialog: the panel, wired to the shared profile save. */
export function AgentSubagentsRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const save = useAgentPatch(agentId, profile);

  return (
    <AgentSubagentsSection
      agentId={agentId}
      subagents={profile.subagents}
      canManage={profile.canManage}
      onSave={(subagents) => save({ subagents })}
    />
  );
}
