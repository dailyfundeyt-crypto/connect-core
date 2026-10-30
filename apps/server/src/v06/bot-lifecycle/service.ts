import type { HardDeleteBotRes } from "../../contracts/v06/bot-lifecycle";
import {
  findBotById,
  getBotCompanyAssignments,
  getBotChatsMetadata,
  removeBotFromCompanyRecord,
  executeHardDeleteInTransaction,
} from "./repo";
import { writeBotExport, type BotExportPayload } from "./export";

export class LifecycleHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleHttpError";
  }
}

/**
 * Entfernt die Zuordnung eines Bots zu einem Unternehmen.
 * Der Bot selbst bleibt dabei bestehen.
 * 404 wenn der Bot nicht existiert oder nicht der Firma zugeordnet ist.
 */
export async function removeBotFromCompany(
  botId: string,
  companyId: string,
  dbOverride?: any,
): Promise<{ ok: boolean; botId: string; companyId: string }> {
  if (!botId || botId.trim() === "") {
    throw new LifecycleHttpError(400, "Missing botId.");
  }
  if (!companyId || companyId.trim() === "") {
    throw new LifecycleHttpError(400, "Missing companyId.");
  }

  const cleanBotId = botId.trim();
  const cleanCompanyId = companyId.trim();

  // 1. Bot muss existieren
  const bot = await findBotById(cleanBotId, dbOverride);
  if (!bot) {
    throw new LifecycleHttpError(404, `Bot '${cleanBotId}' not found.`);
  }

  // 2. Zuordnung pruefen
  const assignedCompanies = await getBotCompanyAssignments(cleanBotId, dbOverride);
  if (!assignedCompanies.includes(cleanCompanyId)) {
    throw new LifecycleHttpError(
      404,
      `Bot '${cleanBotId}' is not assigned to company '${cleanCompanyId}'.`,
    );
  }

  // 3. Zuordnung aufheben
  await removeBotFromCompanyRecord(cleanBotId, cleanCompanyId, dbOverride);

  return {
    ok: true,
    botId: cleanBotId,
    companyId: cleanCompanyId,
  };
}

export interface HardDeleteOptions {
  exportDirOverride?: string;
  simulateExportFailure?: boolean;
  dbOverride?: any;
}

/**
 * Loescht einen Bot unwiderruflich aus der Datenbank nach Namensbestaetigung.
 * VOR dem Loeschen wird zwingend ein vollstaendiger JSON-Export geschrieben.
 * Schlaegt der Export fehl, wird KEINE Zeile geloescht.
 */
export async function hardDeleteBot(
  botId: string,
  confirmName: string,
  options: HardDeleteOptions = {},
): Promise<HardDeleteBotRes> {
  if (!botId || botId.trim() === "") {
    throw new LifecycleHttpError(400, "Missing botId.");
  }

  const cleanBotId = botId.trim();

  // 1. Bot laden
  const bot = await findBotById(cleanBotId, options.dbOverride);
  if (!bot) {
    throw new LifecycleHttpError(404, `Bot '${cleanBotId}' not found.`);
  }

  // 2. confirmName validieren (muss exakt mit Bot-Name oder Titel uebereinstimmen)
  const inputName = (confirmName || "").trim();
  const botName = (bot.name || "").trim();
  const botTitle = (bot.title || "").trim();

  if (!inputName || (inputName !== botName && inputName !== botTitle)) {
    throw new LifecycleHttpError(
      400,
      `Confirmation name '${inputName}' does not match bot name '${botName}'.`,
    );
  }

  // 3. Exportdaten zusammenstellen
  const companyIds = await getBotCompanyAssignments(cleanBotId, options.dbOverride);
  const chatsMetadata = await getBotChatsMetadata(cleanBotId, options.dbOverride);

  const exportPayload: BotExportPayload = {
    exportVersion: "1.0",
    exportedAt: new Date().toISOString(),
    bot: {
      id: bot.id,
      name: bot.name,
      title: bot.title,
      roleDescription: bot.roleDescription,
      role: bot.role,
      headline: bot.headline,
      description: bot.description,
      type: bot.type,
      chosenCli: bot.chosenCli,
      skills: bot.skills,
      accountEmail: bot.accountEmail,
      avatarSeed: bot.avatarSeed,
      configuration: bot.configuration,
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
    },
    prompts: {
      systemPrompt:
        bot.configuration?.systemPrompt ||
        bot.configuration?.prompt ||
        bot.description ||
        undefined,
      suggestedPrompts: bot.configuration?.suggestedPrompts || [],
      customInstructions: bot.configuration?.instructions,
    },
    folderAssignment: {
      companyIds,
      folders: bot.configuration?.folders || [],
    },
    chatsMetadata,
  };

  // 4. JSON-Export schreiben (Muss fehlerfrei sein, sonst KEIN Loeschen!)
  if (options.simulateExportFailure) {
    throw new Error("Simulated export disk failure: write permission denied.");
  }

  let exportPath: string;
  try {
    exportPath = writeBotExport(exportPayload, options.exportDirOverride);
  } catch (err: any) {
    throw new Error(`Export failed before deletion. No data was deleted. Cause: ${err?.message}`);
  }

  // 5. Unwiderrufliche Loeschung in Transaktion
  await executeHardDeleteInTransaction(cleanBotId, options.dbOverride);

  return {
    botId: cleanBotId,
    exportPath,
    deletedAt: new Date().toISOString(),
  };
}
