/**
 * Store Package Manifest Validator and Hasher (Lane 8)
 * Verifies package integrity, permissions, and metadata.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type { StoreCategory, StoreManifest, StorePackageType } from "./types";

export const KNOWN_PERMISSIONS = {
  "network:outbound": "Ausgehende Web- und API-Anfragen senden",
  "storage:local": "Lokale persistente Daten in Postgres speichern",
  "agent:execute": "Bots, LLM-Aktionen und Workflows ausführen",
  "mcp:tools": "MCP-Tools im System registrieren und aufrufen",
  "company:read": "Firmendaten, Dokumente und Einstellungen lesen",
  "company:write": "Unternehmenseinstellungen und Workspaces aktualisieren",
  "system:shell": "Lokale Terminal-Befehle oder CLI-Tools aufrufen",
} as const;

export const StoreManifestSchema = z.object({
  id: z
    .string()
    .min(2, "ID muss mindestens 2 Zeichen lang sein")
    .regex(/^[a-z0-9-_]+$/, "ID darf nur Kleinbuchstaben, Zahlen, Bindestriche und Unterstriche enthalten"),
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  displayName: z.string().min(2, "Anzeigename muss mindestens 2 Zeichen lang sein"),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, "Ungültiges SemVer-Format (z.B. 1.0.0)"),
  type: z.enum(["mcp", "tool", "skill", "company", "agent"]),
  category: z.enum(["agent", "skill", "mcp", "template", "plugin"]).optional(),
  description: z.string().min(5, "Beschreibung muss mindestens 5 Zeichen lang sein"),
  author: z.string().min(2, "Autor muss mindestens 2 Zeichen lang sein"),
  entryPoint: z.string().min(1, "Einstiegspunkt erforderlich"),
  permissions: z.array(z.string()).default([]),
  icon: z.string().optional(),
  tags: z.array(z.string()).default([]),
  pricing: z
    .object({
      type: z.enum(["free", "buy", "rent", "subscription"]).default("free"),
      price: z.string().optional(),
      period: z.enum(["Tag", "Woche", "Monat", "Jahr"]).optional(),
      label: z.string().optional(),
    })
    .default({ type: "free", label: "Kostenlos" }),
  screenshots: z.array(z.string()).default([]),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  hash: z.string().optional(),
  signature: z.string().optional(),
});

/** Maps package type to canonical contracts category */
export function resolveCategoryForType(type: StorePackageType): StoreCategory {
  switch (type) {
    case "mcp":
      return "mcp";
    case "tool":
      return "plugin";
    case "skill":
      return "skill";
    case "company":
      return "template";
    case "agent":
      return "agent";
    default:
      return "plugin";
  }
}

/** Computes SHA-256 hash of a manifest payload */
export function calculateManifestHash(manifest: Record<string, unknown>): string {
  // Exclude hash and signature from hash payload
  const { hash: _h, signature: _s, ...clean } = manifest;
  const canonicalString = JSON.stringify(clean, Object.keys(clean).sort());
  return createHash("sha256").update(canonicalString).digest("hex");
}

/** Generates verification signature mark */
export function generateVerificationSignature(hash: string, author: string): string {
  const ts = new Date().toISOString();
  return `sig_openbot_${createHash("sha256").update(`${hash}:${author}:${ts}`).digest("hex").slice(0, 32)}`;
}

/** Validates and canonicalizes raw input as a StoreManifest */
export function validateAndCanonizeManifest(
  raw: unknown,
): { valid: true; manifest: StoreManifest; hash: string } | { valid: false; errors: string[] } {
  const result = StoreManifestSchema.safeParse(raw);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((e: any) => `${e.path.join(".")}: ${e.message}`),
    };
  }

  const data = result.data;
  const hash = calculateManifestHash(data as unknown as Record<string, unknown>);
  const category = data.category ?? resolveCategoryForType(data.type);
  const signature = data.signature || generateVerificationSignature(hash, data.author);

  const manifest: StoreManifest = {
    ...data,
    category,
    hash,
    signature,
  };

  return { valid: true, manifest, hash };
}
