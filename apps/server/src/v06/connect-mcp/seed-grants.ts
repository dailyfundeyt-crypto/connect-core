/**
 * Vorschlags-Grants für Grok Bot und Partner-Agenten (v06 / Wave 2 / A18).
 *
 * HINWEIS: Dieses Skript wird NICHT automatisch ausgeführt, sondern dient als
 * Seed-Vorlage zur manuellen oder kontrollierten Erteilung durch den Administrator (Stefan).
 *
 * Vorgeschlagene Freigaben:
 * - grokbot:hyper     → Hyper-Swarm (operate + open_ui) in c-hyper
 * - grokbot:flux      → Flux-Swarm (operate) in c-flux
 * - connect-wartung   → alle Firmen '*' read (Gesundheitsstatus der Agenten)
 * - grokbot:analysis  → Analysis-Swarm (operate) in c-analysis
 * - cnt-code          → brain_write + use_agents (Perplexity/Recherche) über alle Firmen
 */

import type { Database } from "../../db/client";
import { createSwarmGrant, listSwarmGrants } from "./grants";
import { createMcpToken } from "./tokens";
import type { SwarmScope, SwarmGrantWithMeta } from "./types";

export interface SuggestedGrantDef {
  principal: string;
  companyId: string;
  swarmId?: string;
  scopes: SwarmScope[];
  description: string;
  tokenLabel: string;
}

export const SUGGESTED_SWARM_GRANTS: SuggestedGrantDef[] = [
  {
    principal: "grokbot:hyper",
    companyId: "c-hyper",
    swarmId: "hyper-swarm",
    scopes: ["operate", "open_ui", "read"],
    description: "Grok Bot Hyper: Steuerung des Hyper-Schwarms und UI-Aufruf per QR-Link",
    tokenLabel: "Grok Bot Hyper Token",
  },
  {
    principal: "grokbot:flux",
    companyId: "c-flux",
    swarmId: "flux-swarm",
    scopes: ["operate", "read"],
    description: "Grok Bot Flux: Steuerung des Flux-Schwarms für Bild- & Content-Pipelines",
    tokenLabel: "Grok Bot Flux Token",
  },
  {
    principal: "connect-wartung",
    companyId: "*",
    scopes: ["read"],
    description: "Connect Wartung: Firmenübergreifender Lesezugriff auf agent_health und Metriken",
    tokenLabel: "Connect Wartung Monitor Token",
  },
  {
    principal: "grokbot:analysis",
    companyId: "c-analysis",
    swarmId: "analysis-swarm",
    scopes: ["operate", "read"],
    description: "Grok Bot Analysis: Analyse- und Verifikations-Aufgaben im Analysis-Schwarm",
    tokenLabel: "Grok Bot Analysis Token",
  },
  {
    principal: "cnt-code",
    companyId: "*",
    scopes: ["brain_write", "use_agents", "read"],
    description: "CNT Code: Recherche-Agenten (Perplexity) nutzen und Ergebnisse ins Brain schreiben",
    tokenLabel: "CNT Code Automation Token",
  },
];

/**
 * Führt das Seeden der Vorschlags-Grants aus.
 * Prüft auf Duplikate, damit bereits existierende Grants nicht doppelt angelegt werden.
 */
export async function seedSuggestedGrants(
  database?: Database,
): Promise<{
  createdGrants: SwarmGrantWithMeta[];
  createdTokens: Array<{ principal: string; plaintextToken: string; label: string }>;
}> {
  const existingGrants = await listSwarmGrants(undefined, database);
  const createdGrants: SwarmGrantWithMeta[] = [];
  const createdTokens: Array<{ principal: string; plaintextToken: string; label: string }> = [];

  for (const def of SUGGESTED_SWARM_GRANTS) {
    const exists = existingGrants.some(
      (g) => g.principal === def.principal && g.companyId === def.companyId && !g.revokedAt,
    );

    if (!exists) {
      const grant = await createSwarmGrant(
        {
          principal: def.principal,
          companyId: def.companyId,
          swarmId: def.swarmId,
          scopes: def.scopes,
        },
        database,
      );
      createdGrants.push(grant);

      // Erzeuge zugehörigen Token (Plaintext)
      const token = await createMcpToken(
        {
          principal: def.principal,
          label: def.tokenLabel,
          lifetime: "permanent",
        },
        database,
      );

      createdTokens.push({
        principal: def.principal,
        plaintextToken: token.plaintextToken,
        label: def.tokenLabel,
      });
    }
  }

  return { createdGrants, createdTokens };
}
