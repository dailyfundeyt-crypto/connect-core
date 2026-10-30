/**
 * Agent Websites Management & CLI-Provisioning (Phase C Schritt 13).
 *
 * Verwaltet die Webseiten-Liste eines Agenten:
 * - Tabelle URL + „wofür“ (Zweck / Beschreibung)
 * - An/Aus Status pro URL
 * - Physische Bereitstellung im Workspace und Config-Ordner beim CLI-Start:
 *   1. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\WEBSITES.md
 *   2. %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\websites.json
 *   3. %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home\WEBSITES.md
 *   4. Umgebungsvariablen (CONNECT_AGENT_WEBSITES, AGENT_WEBSITES)
 *   5. Kontext-Injektion in Prompt / Instruktionen
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentWebsite = {
  id: string;
  url: string;
  purpose: string; // „wofür“ / Zweck
  enabled: boolean;
  createdAt?: string;
};

/**
 * Normalisiert ein Webseiten-Array aus DB / Request.
 * Akzeptiert Strings ("https://...") oder Objekte ({ url, purpose, wofuer, enabled, id }).
 */
export function normalizeAgentWebsites(rawWebsites: unknown): AgentWebsite[] {
  let parsed = rawWebsites;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const list: AgentWebsite[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item === "string" && item.trim()) {
      const url = item.trim();
      const id = `web-${i + 1}-${encodeURIComponent(url.slice(0, 20)).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
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

      if (!seenIds.has(id)) {
        seenIds.add(id);
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
 * Filtert aktive (enabled = true) Webseiten.
 */
export function getActiveWebsites(websites: AgentWebsite[]): AgentWebsite[] {
  return websites.filter((w) => w.enabled);
}

/**
 * Formatiert die Webseiten-Tabelle als Markdown-Kontext für den Agenten.
 */
export function formatWebsitesContext(websites: AgentWebsite[]): string {
  const active = getActiveWebsites(websites);
  if (active.length === 0) {
    return "";
  }

  const lines: string[] = [
    "### Bekannte Webseiten & Portale (Kontext für Aufgaben & Recherche)",
    "",
    "| URL | Wofür / Zweck |",
    "| --- | --- |",
  ];

  for (const site of active) {
    const escapedUrl = site.url.replace(/\|/g, "\\|");
    const escapedPurpose = (site.purpose || "Recherche").replace(/\|/g, "\\|");
    lines.push(`| ${escapedUrl} | ${escapedPurpose} |`);
  }

  lines.push("");
  lines.push("**Hinweis für den Agenten:** Nutze diese URLs gezielt bei Recherche- und Automatisierungs-Aufgaben im Browser.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Schreibt aktive Webseiten physisch in den Workspace des Agenten als WEBSITES.md
 * und websites.json, damit die CLIs und Werkzeuge sie direkt als Kontext-Dateien lesen können.
 */
export function syncAgentWebsitesToWorkspace(
  agentId: string,
  websites: AgentWebsite[],
  workspaceDir: string,
  antigravityHome?: string,
): { activeCount: number; websitesDocPath: string } {
  mkdirSync(workspaceDir, { recursive: true });

  const active = getActiveWebsites(websites);

  // 1. WEBSITES.md im Workspace als Markdown-Tabelle
  const mdLines: string[] = [
    `# Webseiten-Liste: ${agentId}`,
    "",
    `Dieser Agent hat ${active.length} hinterlegte Webseiten als Arbeitskontext:`,
    "",
    "| URL | Wofür / Zweck |",
    "| --- | --- |",
  ];

  if (active.length === 0) {
    mdLines.push("| *(keine)* | *(keine Webseiten hinterlegt)* |");
  } else {
    for (const site of active) {
      const urlCell = site.url.replace(/\|/g, "\\|");
      const purposeCell = (site.purpose || "Recherche").replace(/\|/g, "\\|");
      mdLines.push(`| [${urlCell}](${site.url}) | ${purposeCell} |`);
    }
  }

  mdLines.push("");
  mdLines.push("## Details zu den Webseiten");
  mdLines.push("");
  if (active.length === 0) {
    mdLines.push("Aktuell sind keine Webseiten für diesen Agenten hinterlegt.");
  } else {
    for (const site of active) {
      mdLines.push(`### ${site.url}`);
      mdLines.push(`- **Zweck / Wofür:** ${site.purpose || "Allgemeine Recherche"}`);
      mdLines.push(`- **Status:** Aktiv`);
      mdLines.push("");
    }
  }

  const websitesDocPath = join(workspaceDir, "WEBSITES.md");
  try {
    writeFileSync(websitesDocPath, mdLines.join("\n"), "utf8");
  } catch {
    // Best-effort
  }

  // 2. websites.json Manifest im Workspace
  try {
    writeFileSync(
      join(workspaceDir, "websites.json"),
      JSON.stringify(
        {
          agentId,
          updatedAt: new Date().toISOString(),
          activeCount: active.length,
          websites: active,
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
      writeFileSync(join(antigravityHome, "WEBSITES.md"), mdLines.join("\n"), "utf8");
    } catch {
      // Best-effort
    }
  }

  return {
    activeCount: active.length,
    websitesDocPath,
  };
}
