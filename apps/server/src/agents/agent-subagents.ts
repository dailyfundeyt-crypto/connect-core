/**
 * Agent Subagents (Online-KIs) Management & CLI-Provisioning (Phase C Schritt 14).
 *
 * Verwaltet die Subagenten (Online-KIs) eines Agenten:
 * - Liste mit Name, Link, Beschreibung, editierbar
 * - Startwerte:
 *   1. Manus (manus.im/app, komplexe Browsernutzung)
 *   2. Perplexity Computer (perplexity.ai/computer, Recherche)
 *   3. Ottermind (ottermind.ai/studio/task, Datenauswertung)
 *   4. Lovable (lovable.dev/dashboard, Landing Pages)
 * - An/Aus Status pro Subagent
 * - Physische Bereitstellung im Workspace und Config-Ordner beim CLI-Start:
 *   1. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\SUBAGENTS.md
 *   2. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\subagents.json
 *   3. %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home\SUBAGENTS.md
 *   4. Umgebungsvariablen (CONNECT_AGENT_SUBAGENTS, AGENT_SUBAGENTS)
 *   5. Kontext-Injektion in Prompt / Instruktionen
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentSubagent = {
  id: string;
  name: string;
  url: string; // Link / URL zum Online-KI-Portal
  description: string; // Zweck / Spezialisierung
  enabled: boolean;
  createdAt?: string;
};

/**
 * Startwerte gemäß Anforderung:
 * - Manus (manus.im/app, komplexe Browsernutzung)
 * - Perplexity Computer (perplexity.ai/computer, Recherche)
 * - Ottermind (ottermind.ai/studio/task, Datenauswertung)
 * - Lovable (lovable.dev/dashboard, Landing Pages)
 */
export const DEFAULT_SUBAGENTS: AgentSubagent[] = [
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

/**
 * Normalisiert ein Subagenten-Array aus DB / Request.
 * Falls keine Einträge vorhanden sind (null/undefined/[]),
 * werden automatisch die geforderten Startwerte zurückgegeben.
 */
export function normalizeAgentSubagents(rawSubagents: unknown): AgentSubagent[] {
  let parsed = rawSubagents;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return DEFAULT_SUBAGENTS.map((item) => ({ ...item }));
    }
  }

  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return DEFAULT_SUBAGENTS.map((item) => ({ ...item }));
  }

  const list: AgentSubagent[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item === "string" && item.trim()) {
      const name = item.trim();
      const id = `subagent-${i + 1}-${encodeURIComponent(name.slice(0, 20)).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
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

      if (!seenIds.has(id)) {
        seenIds.add(id);
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
    return DEFAULT_SUBAGENTS.map((item) => ({ ...item }));
  }

  return list;
}

/**
 * Filtert aktive (enabled = true) Subagenten.
 */
export function getActiveSubagents(subagents: AgentSubagent[]): AgentSubagent[] {
  return subagents.filter((s) => s.enabled);
}

/**
 * Formatiert die Subagenten-Tabelle als Markdown-Kontext für den Agenten.
 */
export function formatSubagentsContext(subagents: AgentSubagent[]): string {
  const active = getActiveSubagents(subagents);
  if (active.length === 0) {
    return "";
  }

  const lines: string[] = [
    "### Verfügbare Subagenten (Online-KIs)",
    "",
    "| Name | Link / Portal | Spezialisierung / Beschreibung |",
    "| --- | --- | --- |",
  ];

  for (const sub of active) {
    const escapedName = sub.name.replace(/\|/g, "\\|");
    const escapedUrl = sub.url.replace(/\|/g, "\\|");
    const escapedDesc = (sub.description || "Online-KI").replace(/\|/g, "\\|");
    lines.push(`| ${escapedName} | [${escapedUrl}](${sub.url}) | ${escapedDesc} |`);
  }

  lines.push("");
  lines.push(
    "**Hinweis für den Agenten:** Nutze diese Online-KIs für spezialisierte Teilaufgaben: Manus für komplexe Browsernutzung, Perplexity Computer für tiefgehende Recherche, Ottermind für Datenauswertung und Lovable für Landing Pages / Frontend-Entwicklung.",
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Schreibt aktive Subagenten physisch in den Workspace des Agenten als SUBAGENTS.md
 * und subagents.json, damit CLIs und Werkzeuge sie direkt als Kontext-Dateien lesen können.
 */
export function syncAgentSubagentsToWorkspace(
  agentId: string,
  subagents: AgentSubagent[],
  workspaceDir: string,
  antigravityHome?: string,
): { activeCount: number; subagentsDocPath: string } {
  mkdirSync(workspaceDir, { recursive: true });

  const active = getActiveSubagents(subagents);

  // 1. SUBAGENTS.md im Workspace als Markdown-Tabelle
  const mdLines: string[] = [
    `# Subagenten-Liste (Online-KIs): ${agentId}`,
    "",
    `Dieser Agent verfügt über ${active.length} konfigurierte Online-KI-Subagenten:`,
    "",
    "| Name | Link / Portal | Spezialisierung / Beschreibung |",
    "| --- | --- | --- |",
  ];

  if (active.length === 0) {
    mdLines.push("| *(keine)* | *(keine)* | *(keine aktiven Subagenten konfiguriert)* |");
  } else {
    for (const sub of active) {
      const nameCell = sub.name.replace(/\|/g, "\\|");
      const urlCell = sub.url.replace(/\|/g, "\\|");
      const descCell = (sub.description || "Online-KI").replace(/\|/g, "\\|");
      mdLines.push(`| **${nameCell}** | [${urlCell}](${sub.url}) | ${descCell} |`);
    }
  }

  mdLines.push("");
  mdLines.push("## Details zu den Online-KI-Subagenten");
  mdLines.push("");
  if (active.length === 0) {
    mdLines.push("Aktuell sind keine Subagenten für diesen Agenten aktiviert.");
  } else {
    for (const sub of active) {
      mdLines.push(`### ${sub.name}`);
      mdLines.push(`- **Link / URL:** ${sub.url}`);
      mdLines.push(`- **Beschreibung / Spezialisierung:** ${sub.description}`);
      mdLines.push(`- **Status:** Aktiv`);
      mdLines.push("");
    }
  }

  const subagentsDocPath = join(workspaceDir, "SUBAGENTS.md");
  try {
    writeFileSync(subagentsDocPath, mdLines.join("\n"), "utf8");
  } catch {
    // Best-effort
  }

  // 2. subagents.json Manifest im Workspace
  try {
    writeFileSync(
      join(workspaceDir, "subagents.json"),
      JSON.stringify(
        {
          agentId,
          updatedAt: new Date().toISOString(),
          activeCount: active.length,
          subagents: active,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // Best-effort
  }

  // 3. Im Antigravity-Home spiegeln (falls vorhanden)
  if (antigravityHome) {
    try {
      mkdirSync(antigravityHome, { recursive: true });
      writeFileSync(join(antigravityHome, "SUBAGENTS.md"), mdLines.join("\n"), "utf8");
    } catch {
      // Best-effort
    }
  }

  return {
    activeCount: active.length,
    subagentsDocPath,
  };
}
