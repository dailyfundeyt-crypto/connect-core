import {
  IconInfoCircle,
  IconPlus,
  IconSparkles,
  IconTerminal2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AgentProfile,
  AgentSkill,
} from "@/lib/agents/queries";
import { useAgentPatch } from "@/lib/agents/use-agent-patch";
import { cn } from "@/lib/utils";

export const DEFAULT_BUILTIN_SKILLS: AgentSkill[] = [
  {
    id: "web-search",
    name: "Websuche & Recherche",
    description: "Echtzeit-Websuche, Faktenprüfung und Quellenanalyse für aktuelle Infos",
    enabled: true,
    prompt: "Führe proaktiv Websuchen durch, um aktuelle Fakten, URLs und Dokumentationen zu prüfen.",
    source: "builtin",
  },
  {
    id: "browser-use",
    name: "Helium Browser Automation",
    description: "Steuerung von Webseiten via Helium/Playwright (Klicks, Navigation, Formulare)",
    enabled: true,
    prompt: "Nutze das Helium-Browser-Profil, um Webseiten interaktiv zu bedienen, Formulare auszufüllen und Screenshots zu prüfen.",
    source: "builtin",
  },
  {
    id: "code-analysis",
    name: "Code-Analyse & Refactoring",
    description: "Architekturprüfung, TypeScript/Python-Code-Review und Fehlerdiagnose",
    enabled: false,
    prompt: "Analysiere Code-Strukturen, identifiziere Code-Smells und erstelle verlässliche Korrekturen und Tests.",
    source: "builtin",
  },
  {
    id: "file-workspace",
    name: "Workspace- & Dateiverwaltung",
    description: "Dateien im Agenten-Workspace strukturiert lesen, erzeugen und organisieren",
    enabled: true,
    prompt: "Halte den Arbeitsordner ordentlich, sichere wichtige Stände vor Änderungen und dokumentiere deine Schritte.",
    source: "builtin",
  },
  {
    id: "api-connector",
    name: "REST- & API-Anbindung",
    description: "Automatisierte HTTP-Requests, JSON-Parsing und externe Schnittstellen",
    enabled: false,
    prompt: "Nutze HTTP-APIs mit validen Headern, prüfe Statuscodes und verarbeite strukturierte JSON-Daten.",
    source: "builtin",
  },
  {
    id: "data-analytics",
    name: "Datenanalyse & Tabellen",
    description: "Verarbeitung strukturierter Daten, CSV/JSON/Excel-Auswertungen und Metriken",
    enabled: false,
    prompt: "Analysiere Datensätze, berechne Summen und Durchschnitte und präsentiere Kennzahlen in sauberen Markdown-Tabellen.",
    source: "builtin",
  },
];

export function mergeWithCatalog(existing?: AgentSkill[] | null): AgentSkill[] {
  const current = existing && Array.isArray(existing) ? existing : [];
  const map = new Map<string, AgentSkill>();

  // Alle Standard-Skills initialisieren
  for (const item of DEFAULT_BUILTIN_SKILLS) {
    map.set(item.id, { ...item });
  }

  // Gespeicherte Skills überschreiben / ergänzen
  for (const item of current) {
    if (typeof item === "string") {
      const id = (item as string).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      map.set(id, {
        id,
        name: item,
        description: "Skill",
        enabled: true,
        source: "custom",
      });
    } else if (item && typeof item === "object") {
      const raw = item as AgentSkill;
      const id = raw.id || (raw.name || "skill").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const prev = map.get(id);
      map.set(id, {
        ...(prev ?? {}),
        ...raw,
        id,
        name: raw.name || prev?.name || id,
        enabled: raw.enabled !== false,
      });
    }
  }

  return Array.from(map.values());
}

export function AgentSkillsSection({
  agentId: _agentId,
  skills: initialSkills,
  canManage,
  onSave,
}: {
  agentId: string;
  skills?: AgentSkill[] | null;
  canManage: boolean;
  onSave: (skills: AgentSkill[]) => Promise<unknown>;
}) {
  const skills = mergeWithCatalog(initialSkills);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  const activeCount = skills.filter((s) => s.enabled).length;

  const handleToggle = async (skillId: string, currentEnabled: boolean) => {
    if (!canManage || saving) return;
    const nextSkills = skills.map((s) =>
      s.id === skillId ? { ...s, enabled: !currentEnabled } : s,
    );
    setSaving(true);
    try {
      await onSave(nextSkills);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!canManage || saving) return;
    const nextSkills = skills.filter((s) => s.id !== skillId);
    setSaving(true);
    try {
      await onSave(nextSkills);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || saving) return;

    const cleanName = newName.trim();
    const id = cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40) || `skill-${Date.now()}`;
    const newSkill: AgentSkill = {
      id,
      name: cleanName,
      description: newDesc.trim() || "Benutzerdefinierter Skill",
      prompt: newPrompt.trim() || undefined,
      enabled: newEnabled,
      source: "custom",
      createdAt: new Date().toISOString(),
    };

    const nextSkills = [...skills.filter((s) => s.id !== id), newSkill];
    setSaving(true);
    try {
      await onSave(nextSkills);
      setNewName("");
      setNewDesc("");
      setNewPrompt("");
      setNewEnabled(true);
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Kopfbereich */}
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card/80 to-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <IconSparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Skills & Fähigkeiten
                </h3>
                <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                  {activeCount} von {skills.length} aktiv
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Skills des Agenten aktivieren, deaktivieren oder neue hinzufügen.
              </p>
            </div>
          </div>

          {canManage && !adding && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              type="button"
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <IconPlus className="size-3.5" />
              Skill hinzufügen
            </Button>
          )}
        </div>

        {/* Hinweis zur CLI-Synchronisation */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-background/60 p-2.5 text-[11px] text-muted-foreground">
          <IconTerminal2 className="size-4 shrink-0 text-sky-500 mt-0.5" />
          <div>
            <span className="font-semibold text-foreground">
              CLI-Start Synchronisation:
            </span>{" "}
            Alle aktiven Skills werden beim Starten der CLI (%LOCALAPPDATA%\ConnectAgents\workspace\SKILLS.md & .gemini/skills) bereitgestellt und per Umgebungsvariablen mitgegeben.
          </div>
        </div>
      </div>

      {/* Neuer Skill hinzufügen Formular */}
      {adding && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-xl border border-sky-500/40 bg-card p-4 shadow-sm flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <IconPlus className="size-3.5 text-sky-500" />
              Neuen Skill definieren
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setAdding(false)}
              type="button"
            >
              <IconX className="size-3.5" />
            </Button>
          </div>

          <div className="grid gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Skill-Name *
              </label>
              <Input
                placeholder="z.B. Excel-Export, Marktrecherche, PDF-Parser"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-xs h-8"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Kurzbeschreibung
              </label>
              <Input
                placeholder="z.B. Erstellt formatierte Tabellen und berechnet Kennzahlen"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Instruktionen / Prompt-Anweisungen (optional)
              </label>
              <Textarea
                placeholder="Detaillierte Anweisungen für den Agenten, wenn dieser Skill aktiv ist..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={3}
                className="text-xs resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="text-xs text-foreground cursor-pointer flex items-center gap-2">
                <Switch
                  checked={newEnabled}
                  onCheckedChange={setNewEnabled}
                />
                <span className="text-xs">Sofort aktivieren</span>
              </label>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="submit"
                  disabled={!newName.trim() || saving}
                  className="h-8 text-xs"
                >
                  {saving ? "Speichert…" : "Skill speichern"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setAdding(false)}
                  disabled={saving}
                  className="h-8 text-xs"
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Liste der Skills */}
      <div className="grid gap-2">
        {skills.map((skill) => {
          const isExpanded = expandedSkillId === skill.id;
          const isCustom = skill.source === "custom";

          return (
            <div
              key={skill.id}
              className={cn(
                "rounded-xl border transition-colors p-3 flex flex-col gap-2",
                skill.enabled
                  ? "border-border/80 bg-card/60"
                  : "border-border/40 bg-muted/10 opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {skill.name}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                        skill.enabled
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-muted text-muted-foreground border border-border/50",
                      )}
                    >
                      {skill.enabled ? "Aktiv" : "Aus"}
                    </span>
                    {isCustom && (
                      <span className="rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.2 text-[9px]">
                        Eigen
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {skill.description || "Keine Beschreibung vorhanden."}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canManage && (
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={() => void handleToggle(skill.id, skill.enabled)}
                      disabled={saving}
                      aria-label={`${skill.name} an/aus`}
                    />
                  )}
                  {isCustom && canManage && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void handleDelete(skill.id)}
                      disabled={saving}
                      title="Skill löschen"
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {skill.prompt && (
                <div className="pt-1 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSkillId(isExpanded ? null : skill.id)
                    }
                    className="text-[10px] text-sky-500 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <IconInfoCircle className="size-3" />
                    {isExpanded ? "Instruktionen verbergen" : "Instruktionen anzeigen"}
                  </button>
                  {isExpanded && (
                    <pre className="mt-1.5 rounded-lg bg-muted/40 p-2 text-[10px] text-foreground font-mono whitespace-pre-wrap">
                      {skill.prompt}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The skills register of the agent dialog: the panel, wired to the shared profile save. */
export function AgentSkillsRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const save = useAgentPatch(agentId, profile);

  return (
    <AgentSkillsSection
      agentId={agentId}
      skills={profile.skills}
      canManage={profile.canManage}
      onSave={(skills) => save({ skills })}
    />
  );
}
