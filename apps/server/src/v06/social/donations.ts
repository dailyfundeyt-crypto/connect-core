/**
 * Connect-Sozial: Bot Donations Service (v06 / A21)
 *
 * Verantwortlich für:
 * - Bot-Spenden an Forschungsprojekte (dailyQuota, Zeitraum)
 * - Validierung von Quota und Datum
 * - Zuordnung von Bots zur Unterstützung von Projekten
 */

import { randomUUID } from "node:crypto";
import type { BotDonation } from "../../contracts/v06/social";
import { getProjectById } from "./projects";
import { createPost } from "./posts";

export interface CreateDonationInput {
  botId: string;
  ownerId: string;
  dailyQuota: number;
  until?: string;
}

export interface StoredDonation extends BotDonation {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

const memoryDonations = new Map<string, StoredDonation>();

export function resetMemoryDonationsStore(): void {
  memoryDonations.clear();
}

export function seedMemoryDonation(donation: StoredDonation): void {
  memoryDonations.set(donation.id, { ...donation });
}

/**
 * Erstellt eine Bot-Spende für ein Forschungsprojekt.
 */
export async function createBotDonation(
  projectId: string,
  input: CreateDonationInput,
  options?: { dbOverride?: any },
): Promise<{ ok: boolean; donation: BotDonation }> {
  if (!projectId || projectId.trim() === "") {
    throw new Error("projectId ist erforderlich.");
  }
  if (!input.botId || input.botId.trim() === "") {
    throw new Error("botId ist erforderlich.");
  }
  if (!input.ownerId || input.ownerId.trim() === "") {
    throw new Error("ownerId ist erforderlich.");
  }
  if (typeof input.dailyQuota !== "number" || input.dailyQuota <= 0 || !Number.isInteger(input.dailyQuota)) {
    throw new Error("dailyQuota muss eine positive Ganzzahl (> 0) sein.");
  }

  // Prüfen, ob das Zielprojekt existiert
  const project = await getProjectById(projectId, options);
  if (!project) {
    throw new Error(`Projekt mit ID '${projectId}' wurde nicht gefunden.`);
  }

  let untilIso: string | undefined = undefined;
  if (input.until) {
    const d = new Date(input.until);
    if (isNaN(d.getTime())) {
      throw new Error("Ungültiges Datumsformat für 'until'.");
    }
    untilIso = d.toISOString();
  }

  const id = `don_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();

  const stored: StoredDonation = {
    id,
    projectId,
    botId: input.botId.trim(),
    ownerId: input.ownerId.trim(),
    dailyQuota: input.dailyQuota,
    until: untilIso,
    createdAt: now,
    updatedAt: now,
  };

  memoryDonations.set(id, stored);

  const sql = options?.dbOverride;
  if (sql) {
    try {
      await sql`
        INSERT INTO bot_donations (id, project_id, bot_id, owner_id, daily_quota, until, status, created_at, updated_at)
        VALUES (${id}, ${projectId}, ${stored.botId}, ${stored.ownerId}, ${stored.dailyQuota}, ${stored.until ? new Date(stored.until) : null}, 'active', now(), now())
      `;
    } catch {
      // In-Memory Fallback
    }
  }

  // Timeline-Post für die Bot-Spende erzeugen
  try {
    const untilText = stored.until ? ` bis ${new Date(stored.until).toLocaleDateString("de-DE")}` : "";
    await createPost(
      {
        authorCompanyId: project.accountCompanyId,
        authorBotId: stored.botId,
        kind: "project_update",
        text: `🤝 Bot-Spende erhalten: Bot "${stored.botId}" unterstützt das Projekt "${project.title}" mit ${stored.dailyQuota} Anfragen/Tag${untilText}.`,
      },
      options,
    );
  } catch {
    // Ignorieren, falls Post fehlschlägt
  }

  return {
    ok: true,
    donation: {
      projectId: stored.projectId,
      botId: stored.botId,
      ownerId: stored.ownerId,
      dailyQuota: stored.dailyQuota,
      until: stored.until,
    },
  };
}

/**
 * Listet alle aktiven Bot-Spenden für ein Projekt auf.
 */
export async function listDonationsForProject(
  projectId: string,
  options?: { dbOverride?: any },
): Promise<BotDonation[]> {
  const donations = Array.from(memoryDonations.values()).filter((d) => {
    if (d.archivedAt) return false;
    if (d.projectId !== projectId) return false;
    if (d.until && new Date(d.until).getTime() < Date.now()) return false;
    return true;
  });

  return donations.map((d) => ({
    projectId: d.projectId,
    botId: d.botId,
    ownerId: d.ownerId,
    dailyQuota: d.dailyQuota,
    until: d.until,
  }));
}

/**
 * Listet alle aktiven Bot-Spenden eines Besitzers auf.
 */
export async function listDonationsByOwner(
  ownerId: string,
  options?: { dbOverride?: any },
): Promise<BotDonation[]> {
  const donations = Array.from(memoryDonations.values()).filter((d) => {
    if (d.archivedAt) return false;
    if (d.ownerId !== ownerId) return false;
    return true;
  });

  return donations.map((d) => ({
    projectId: d.projectId,
    botId: d.botId,
    ownerId: d.ownerId,
    dailyQuota: d.dailyQuota,
    until: d.until,
  }));
}
