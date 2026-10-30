import fs from "fs";
import path from "path";

export interface BotExportPayload {
  exportVersion: string;
  exportedAt: string;
  bot: {
    id: string;
    name: string;
    title?: string;
    roleDescription?: string;
    role?: string;
    headline?: string;
    description?: string;
    type?: string;
    chosenCli?: string;
    skills?: any;
    accountEmail?: string;
    avatarSeed?: string;
    configuration?: any;
    createdAt?: string;
    updatedAt?: string;
  };
  prompts: {
    systemPrompt?: string;
    suggestedPrompts?: string[];
    routinesInstructions?: string[];
    customInstructions?: any;
  };
  folderAssignment: {
    companyIds: string[];
    folders?: string[];
    projects?: string[];
  };
  chatsMetadata: Array<{
    channelId: string;
    name?: string;
    description?: string;
    summary?: string;
    lastMessageAt?: string;
  }>;
}

/**
 * Ermittelt den standardmaessigen Export-Ordner: %APPDATA%\Connect\bot-exports\
 */
export function getDefaultExportDirectory(): string {
  const appData =
    process.env.APPDATA ||
    path.join(process.env.USERPROFILE || "C:\\Users\\Kunc GmbH", "AppData", "Roaming");
  return path.join(appData, "Connect", "bot-exports");
}

function sanitizeForFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").slice(0, 50);
}

/**
 * Schreibt den vollstaendigen JSON-Export des Bots vor dem Loeschen auf die Festplatte.
 * Verifiziert nach dem Schreiben, dass die Datei existiert und nicht leer ist.
 * Schlaegt der Export fehl, wird eine Ausnahme geworfen, sodass KEIN Loeschvorgang stattfindet.
 */
export function writeBotExport(
  payload: BotExportPayload,
  customDir?: string,
): string {
  const dir = customDir || getDefaultExportDirectory();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const safeName = sanitizeForFilename(payload.bot.name || "unnamed_bot");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `bot-export-${safeName}-${payload.bot.id}-${timestamp}.json`;
  const exportPath = path.join(dir, filename);

  const serialized = JSON.stringify(payload, null, 2);
  fs.writeFileSync(exportPath, serialized, "utf8");

  // Verifikation: Datei muss existieren und Bytes enthalten
  if (!fs.existsSync(exportPath)) {
    throw new Error(`Export verification failed: file was not created at ${exportPath}`);
  }

  const stat = fs.statSync(exportPath);
  if (stat.size === 0) {
    throw new Error(`Export verification failed: file at ${exportPath} is 0 bytes`);
  }

  return exportPath;
}
