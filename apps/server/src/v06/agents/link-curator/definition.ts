/**
 * Link-Kurator Agent (A29) – Bot Definition
 *
 * Antigravity-CLI Bot-Definition für Connect v06.
 * Ermöglicht automatisiertes Kuratieren von Web-Tools aus Instagram-Videos
 * direkt in Spark-Browser-Ordner mit Notizen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SparkMcpToolName } from "../../../contracts/v06/spark-mcp";

export const LINK_CURATOR_AGENT_ID = "agent_link_curator";
export const LINK_CURATOR_SLUG = "link-curator";

/**
 * Erlaubte Spark-MCP Tools für den Link-Kurator (A08).
 */
export const LINK_CURATOR_ALLOWED_SPARK_TOOLS: readonly SparkMcpToolName[] = [
  "folder_context",
  "folder_create",
  "folder_rename",
  "folder_move",
  "folder_mark_settings",
  "link_add",
  "link_move",
  "note_create",
  "note_read",
  "note_update",
  "note_trash",
  "note_attach_to_folder",
] as const;

/**
 * Verbotene Aktionen: Strikte Sicherheitsrichtlinien
 */
export const LINK_CURATOR_FORBIDDEN_ACTIONS = [
  "channel:post", // Kein Posten in Nutzer-Chats
  "email:outbound", // Kein E-Mail-Versand
  "social:post", // Keine Social-Media-Veröffentlichungen
  "payment:execute", // Keine Käufe oder Abonnements
  "account:create", // Kein Erstellen externer Konten
  "stefan_profile:access", // Absolutes Zugriffsverbot auf Stefans persönliches Helium-Profil
] as const;

/**
 * Lädt den System-Prompt aus systemPrompt.md
 */
export function getLinkCuratorSystemPrompt(): string {
  try {
    const promptPath = join(__dirname, "systemPrompt.md");
    return readFileSync(promptPath, "utf-8");
  } catch {
    return (
      "Du bist der Link-Kurator-Agent (A29) auf Basis der Antigravity-CLI. " +
      "Deine Aufgabe ist es, Instagram-Reels zu analysieren und extrahierte Tools in Spark-Ordner abzulegen."
    );
  }
}

/**
 * Vollständige Bot-Definition für die Connect-Registry und Antigravity-CLI
 */
export const LINK_CURATOR_BOT_DEFINITION = {
  id: LINK_CURATOR_AGENT_ID,
  slug: LINK_CURATOR_SLUG,
  name: "Link Curator",
  displayName: "Link-Kurator (Instagram → Spark)",
  version: "1.0.0",
  category: "agent" as const,
  author: "Stefan Kunc",
  role: "Link-Kurator & Instagram-Transkripte",
  description:
    "Transkribiert Instagram-Reels via getthescript.app im isolierten Browser-Profil, extrahiert erwähnte Software-Tools und sortiert sie mit Zweck-Notizen in Spark-Browser-Ordner ein.",

  // Engine: Antigravity CLI Integration
  engine: {
    kind: "antigravity" as const,
    model: "auto",
    allowWrite: false, // Read-only im Dateisystem, Schreibaktionen nur über Spark-MCP
  },
  chosenCli: "antigravity" as const,

  // CLI Ausführungs-Konfiguration
  cli: {
    command: "agy run link-curator",
    help: "Transkribiert Instagram-Links und sortiert gefundene Tools in Spark-Ordner ein.",
    options: {
      url: { type: "string", description: "Instagram Reel oder Video URL" },
      userEmail: { type: "string", description: "Nutzer-E-Mail (z. B. dailyfunde.yt@gmail.com)" },
      dryRun: { type: "boolean", description: "Standard: true. Nur Plan generieren, keine Spark-Mutation" },
      targetFolderId: { type: "string", description: "Optionaler Zielordner in Spark" },
    },
  },

  // Isoliertes Browser-Profil (A09 / A16)
  browserProfile: {
    kind: "browser_profile" as const,
    profileName: "agent_link_curator",
    startUrl: "https://getthescript.app/instagram-transcript",
    allowWrite: false,
  },

  // Zugewiesene Werkzeuge & MCP
  allowedTools: LINK_CURATOR_ALLOWED_SPARK_TOOLS,
  forbiddenActions: LINK_CURATOR_FORBIDDEN_ACTIONS,

  // Persona & Werte
  persona: {
    agentId: LINK_CURATOR_AGENT_ID,
    pillar: "Content Extraction & Tool Curation",
    ownedQuestion:
      "Welche modernen Entwickler-Tools werden in Instagram-Videos vorgestellt und wie werden sie in Spark strukturiert?",
    values: {
      precision: "High",
      speed: "Fast",
      duplicateAvoidance: "Strict",
      privacy: "Strictly isolated agent profile, Stefan profile untouched",
    },
    riskProfile: "Konservativ bezüglich Duplikaten; Dry-Run standardmäßig aktiviert",
    voice: "Pragmatisch, strukturiert, technisch präzise, kuratierend",
  },

  // Feature Flag Zuordnung
  featureFlag: "linkCurator" as const,
} as const;

export type LinkCuratorBotDefinition = typeof LINK_CURATOR_BOT_DEFINITION;
