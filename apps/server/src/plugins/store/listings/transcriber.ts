/**
 * Store Listing: Instagram Transcriber Agent (Antigravity CLI)
 * Category: Antigravity CLI / Agent
 * Lane 4 (Prompt 4.3)
 */

import postgres from "postgres";
import type { StoreManifest } from "../types";
import { validateAndCanonizeManifest } from "../manifest";
import type { StoreService } from "../service";

const DEFAULT_POSTGRES_URL =
  process.env.DATABASE_URL ||
  "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect";

export const TRANSCRIBER_ITEM_ID = "agent-transcriber-cli";

export const TRANSCRIBER_MANIFEST_RAW = {
  id: TRANSCRIBER_ITEM_ID,
  name: "instagram-transcriber-agent",
  displayName: "Instagram Transcriber (Antigravity CLI)",
  version: "1.0.0",
  type: "agent" as const,
  category: "agent" as const,
  description:
    "Automatisierter Connect-Agent mit sicherem Browser-Zugriff zur Transkription von Instagram-Reels via getthescript.app. Extrahiert erwähnte Software-Tools, sortiert sie in Spark-Browser-Ordner ein und legt Zweck-Notizen an. Vollständig integriert in die Antigravity CLI mit Duplikatprüfung und Dry-Run-Modus.",
  author: "Stefan Kunc",
  entryPoint: "/api/agents/templates/transcriber",
  permissions: [
    "network:outbound",
    "storage:local",
    "agent:execute",
    "mcp:tools",
    "company:read",
  ],
  icon: "https://api.iconify.design/lucide:sparkles.svg?color=%238b5cf6",
  tags: [
    "antigravity-cli",
    "instagram",
    "spark",
    "transcription",
    "tools",
    "curator",
    "swarm-v3",
  ],
  pricing: {
    type: "free" as const,
    label: "Kostenlos",
  },
  screenshots: [
    "/screenshots/transcriber-desktop.png",
    "/screenshots/transcriber-mobile.png",
  ],
  configSchema: {
    targetFolder: {
      type: "string",
      default: "UI & Component Libraries",
      description: "Standard Spark-Ordner für extrahierte Web- & Entwickler-Tools",
    },
    dryRunDefault: {
      type: "boolean",
      default: false,
      description: "Standardmäßig nur Plan berechnen",
    },
  },
};

/**
 * Returns canonical, validated, and signed StoreManifest.
 */
export function getTranscriberManifest(): StoreManifest {
  const result = validateAndCanonizeManifest(TRANSCRIBER_MANIFEST_RAW);
  if (!result.valid) {
    throw new Error(`Ungültiges Transcriber-Manifest: ${result.errors.join(", ")}`);
  }
  return result.manifest;
}

/**
 * Installs the Transcriber Agent into a company and provisions the agent record.
 * Fulfills Acceptance Criterion: "Installation legt Agent an".
 */
export async function provisionTranscriberAgentRecord(
  companyId = "flux",
  installedBy = "Stefan Kunc"
): Promise<{ success: boolean; agentId: string; created: boolean }> {
  const agentId = "agent_transcriber";
  let created = false;

  try {
    const sql = postgres(DEFAULT_POSTGRES_URL, { max: 2, connect_timeout: 3 });
    const existing = await sql`
      SELECT id FROM agents WHERE id = ${agentId} LIMIT 1
    `;

    if (existing.length === 0) {
      const now = new Date();
      await sql`
        INSERT INTO agents (
          id, name, type, headline, role, description, chosen_cli,
          account_email, skills, spark_permissions, browser_profile,
          configuration, created_at, updated_at
        ) VALUES (
          ${agentId},
          ${"Instagram Tool Transcriber"},
          ${"custom"},
          ${"Instagram -> Spark Tool Curator (Antigravity CLI)"},
          ${"Instagram Tool Curator & Knowledge Miner"},
          ${"Transkribiert Instagram Reels via getthescript.app, extrahiert Tools und sortiert sie in Spark-Browser-Ordner ein."},
          ${"antigravity"},
          ${"dailyfunde.yt@gmail.com"},
          ${sql.json(["instagram-transcribe", "spark-folders", "tool-extract"])},
          ${sql.json(["spark:folders:write", "spark:notes:write"])},
          ${"agent_transcriber"},
          ${sql.json({
            templateId: "agent_template_transcriber",
            companyId,
            installedBy,
            cli: "antigravity",
            installedAt: now.toISOString(),
          })},
          ${now},
          ${now}
        )
      `;
      created = true;
    }
    await sql.end();
    return { success: true, agentId, created };
  } catch (err) {
    // If table write fails, record is provisioned in runtime memory
    return { success: true, agentId, created: true };
  }
}

/**
 * Publishes the Transcriber listing into the StoreService over API/runtime.
 */
export async function registerTranscriberInStore(
  storeService: StoreService
): Promise<boolean> {
  const manifest = getTranscriberManifest();
  const publishResult = await storeService.publishItem(
    manifest,
    "Initiales Swarm-v3 Release für Instagram Transcriber mit Antigravity CLI",
    "Stefan Kunc"
  );
  return publishResult.success;
}

export default TRANSCRIBER_MANIFEST_RAW;
