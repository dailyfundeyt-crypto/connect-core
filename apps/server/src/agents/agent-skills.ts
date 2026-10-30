/**
 * Agent Skills Management & CLI-Provisioning.
 *
 * Verwaltet die Skills eines Agenten:
 * - Standard-Katalog (Websuche, Browser-Use, Code-Analyse, Workspace, API, Datenanalyse)
 * - Benutzerdefinierte Skills (hinzugefügt im Agent-Detail / Settings)
 * - An/Aus Status pro Skill
 * - Physische Bereitstellung im Workspace und Config-Ordner beim CLI-Start:
 *   1. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\SKILLS.md
 *   2. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\skills.json
 *   3. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\.gemini\skills\<skillId>\SKILL.md
 *   4. %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home\.gemini\skills\<skillId>\SKILL.md
 *   5. Umgebungsvariablen (CONNECT_AGENT_SKILLS, AGENT_SKILLS, ENABLED_SKILLS)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  prompt?: string;
  source?: "builtin" | "custom" | "system";
  createdAt?: string;
};

export const DEFAULT_SKILLS_CATALOG: AgentSkill[] = [
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

/**
 * Normalisiert ein Skills-Array aus der DB (unterstützt Strings, Teilstrukturen
 * und führt vorhandene Einträge mit dem Standard-Katalog zusammen).
 */
export function normalizeAgentSkills(rawSkills: unknown): AgentSkill[] {
  const existingMap = new Map<string, AgentSkill>();

  if (Array.isArray(rawSkills)) {
    for (const item of rawSkills) {
      if (typeof item === "string" && item.trim()) {
        const id = item.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        existingMap.set(id, {
          id,
          name: item.trim(),
          description: "Skill aktiviert",
          enabled: true,
          source: "custom",
        });
      } else if (item && typeof item === "object") {
        const anyItem = item as Record<string, unknown>;
        const rawId = typeof anyItem.id === "string" ? anyItem.id.trim() : "";
        const rawName = typeof anyItem.name === "string" ? anyItem.name.trim() : "";
        const id = (rawId || rawName || "skill")
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-");
        const name = rawName || rawId || id;
        const description =
          typeof anyItem.description === "string" ? anyItem.description : "";
        const enabled = anyItem.enabled !== false;
        const prompt =
          typeof anyItem.prompt === "string" ? anyItem.prompt : undefined;
        const source =
          anyItem.source === "builtin" || anyItem.source === "custom" || anyItem.source === "system"
            ? anyItem.source
            : "custom";
        const createdAt =
          typeof anyItem.createdAt === "string" ? anyItem.createdAt : undefined;

        existingMap.set(id, {
          id,
          name,
          description,
          enabled,
          prompt,
          source,
          createdAt,
        });
      }
    }
  }

  // Führe mit dem Standard-Katalog zusammen, behalte aber gespeicherte Werte bei
  const merged: AgentSkill[] = [];

  for (const cat of DEFAULT_SKILLS_CATALOG) {
    if (existingMap.has(cat.id)) {
      merged.push({
        ...cat,
        ...existingMap.get(cat.id)!,
      });
      existingMap.delete(cat.id);
    } else {
      merged.push({ ...cat });
    }
  }

  // Alle benutzerdefinierten Skills anhängen
  for (const custom of existingMap.values()) {
    merged.push(custom);
  }

  return merged;
}

/**
 * Filtert nur aktive (enabled = true) Skills.
 */
export function getActiveSkills(skills: AgentSkill[]): AgentSkill[] {
  return skills.filter((s) => s.enabled);
}

/**
 * Schreibt aktive Skills physisch in den Workspace des Agenten und in Antigravitys
 * Skill-Suchpfade, damit die CLI (agy, codex, claude, freebuff, hermes) sie
 * sofort verwenden kann.
 */
export function syncAgentSkillsToWorkspace(
  agentId: string,
  skills: AgentSkill[],
  workspaceDir: string,
  antigravityHome?: string,
): { activeCount: number; activeNames: string[]; skillsDocPath: string } {
  mkdirSync(workspaceDir, { recursive: true });

  const active = getActiveSkills(skills);
  const activeNames = active.map((s) => s.name);

  // 1. SKILLS.md im Workspace (wird von allen CLIs als Kontext-Datei direkt gelesen)
  const skillsMdLines: string[] = [
    `# Agent Skills: ${agentId}`,
    "",
    `Dieser Agent verfügt über ${active.length} aktive Fähigkeiten:`,
    "",
  ];

  if (active.length === 0) {
    skillsMdLines.push("Aktuell sind keine zusätzlichen Skills aktiviert.");
  } else {
    for (const s of active) {
      skillsMdLines.push(`## ${s.name} (\`${s.id}\`)`);
      if (s.description) {
        skillsMdLines.push(`*Beschreibung:* ${s.description}`);
      }
      if (s.prompt) {
        skillsMdLines.push("");
        skillsMdLines.push(`**Instruktionen / Guidelines:**\n${s.prompt}`);
      }
      skillsMdLines.push("");
      skillsMdLines.push("---");
      skillsMdLines.push("");
    }
  }

  const skillsDocPath = join(workspaceDir, "SKILLS.md");
  try {
    writeFileSync(skillsDocPath, skillsMdLines.join("\n"), "utf8");
  } catch {
    // Best-effort
  }

  // 2. skills.json Manifest
  try {
    writeFileSync(
      join(workspaceDir, "skills.json"),
      JSON.stringify(
        {
          agentId,
          updatedAt: new Date().toISOString(),
          activeCount: active.length,
          skills: active,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // Best-effort
  }

  // 3. Antigravity Native Skills Struktur: .gemini/skills/<skillId>/SKILL.md
  const targetGeminiDirs: string[] = [join(workspaceDir, ".gemini", "skills")];
  if (antigravityHome) {
    targetGeminiDirs.push(join(antigravityHome, ".gemini", "skills"));
  }

  for (const gDir of targetGeminiDirs) {
    try {
      mkdirSync(gDir, { recursive: true });
      for (const s of active) {
        const skillFolder = join(gDir, s.id);
        mkdirSync(skillFolder, { recursive: true });
        const skillMd = [
          "---",
          `name: ${s.name}`,
          `description: ${s.description || s.name}`,
          "---",
          "",
          `# ${s.name}`,
          "",
          s.prompt || s.description || "Skill aktiv.",
        ].join("\n");
        writeFileSync(join(skillFolder, "SKILL.md"), skillMd, "utf8");
      }
    } catch {
      // Best-effort
    }
  }

  return {
    activeCount: active.length,
    activeNames,
    skillsDocPath,
  };
}
