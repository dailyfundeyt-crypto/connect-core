/**
 * Bestandsnutzer-Provisionierung für Cua-Maschinen.
 *
 * Lane: A19
 * Läuft beim Start idempotent für alle Bestandsnutzer mit Consent-Eintrag.
 * Für `dailyfunde.yt@gmail.com` liegt durch die Seed-Migration (A05) die Admin-Zustimmung vor.
 * -> Genau EINE Sandbox-Maschine `connect-cua-shared-<user>` wird automatisch angelegt,
 *    ohne Onboarding-Abfrage, und ALLEN seinen Agenten zugewiesen (Modus `shared`).
 */

import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { machineInstallConsent, users } from "../../db/schema";
import type { CuaMachineService } from "../service";
import type { IMachineStore } from "../types";

export type SeedResult = {
  processedUsers: number;
  machinesCreated: number;
  agentsAssigned: number;
  details: string[];
};

/**
 * Führt den idempotenten Seed-Job für Bestandsnutzer aus.
 */
export async function runCuaProvisioningSeed(
  service: CuaMachineService,
  store: IMachineStore,
  db?: Database,
): Promise<SeedResult> {
  const result: SeedResult = {
    processedUsers: 0,
    machinesCreated: 0,
    agentsAssigned: 0,
    details: [],
  };

  // Ermittle alle Nutzer-IDs mit vorliegender Zustimmung
  let consentedUserIds: string[] = [];

  if (db) {
    try {
      const consentRows = await db
        .select({ userId: machineInstallConsent.userId })
        .from(machineInstallConsent)
        .where(eq(machineInstallConsent.scope, "cua_install"));

      consentedUserIds = Array.from(new Set(consentRows.map((r) => r.userId)));

      // Falls spezifisch nach dailyfunde.yt@gmail.com gesucht werden soll:
      const stefanRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, "dailyfunde.yt@gmail.com"))
        .limit(1);

      if (stefanRows.length > 0) {
        const stefanId = stefanRows[0].id;
        const hasConsent = await store.hasInstallConsent(stefanId);
        if (hasConsent && !consentedUserIds.includes(stefanId)) {
          consentedUserIds.push(stefanId);
        }
      }
    } catch {
      // Falls DB-Tabellen im Test noch nicht migriert sind, fahre fort
    }
  }

  // Für jeden berechtigten Nutzer die geteilte Standard-Maschine und Agenten-Zuweisung sicherstellen
  for (const userId of consentedUserIds) {
    result.processedUsers++;

    // 1. Prüfen, ob bereits eine geteilte Standard-Maschine existiert
    let sharedMachine = await store.getSharedDefaultMachine();

    if (!sharedMachine) {
      // Vorname/Präfix für sauberen Maschinennamen
      const sanitizedUser = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 12);
      const machineName = `connect-cua-shared-${sanitizedUser}`;

      sharedMachine = await service.installSmallDefault(userId, machineName);
      result.machinesCreated++;
      result.details.push(`Standard-Maschine "${sharedMachine.name}" fuer Nutzer "${userId}" angelegt.`);
    } else {
      result.details.push(`Bereits vorhandene geteilte Maschine "${sharedMachine.name}" verwendet.`);
    }

    // 2. Modus auf 'shared' setzen
    await store.setMachineMode(userId, "shared");

    // 3. Alle vorhandenen Agenten des Nutzers der geteilten Maschine zuweisen
    const agents = await store.getAgentsForUser(userId);
    for (const agent of agents) {
      await store.assignAgentToMachine(agent.id, sharedMachine.id);
      result.agentsAssigned++;
    }
    result.details.push(`${agents.length} Agenten der geteilten Maschine zugewiesen.`);
  }

  return result;
}
