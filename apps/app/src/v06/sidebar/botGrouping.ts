/**
 * Bot-Gruppierung fuer Sidebar v06 (A01)
 *
 * Leitet die Bot-Listen rein aus bestehenden Daten ab:
 * - Bots in Ordnern (zugeordnet zu mindestens einem Projekt/Ordner)
 * - Bots ohne Ordner (gehoeren zur aktiven Firma, aber in keinem Projekt/Ordner)
 */

export interface GroupedBotItem {
  id: string;
  name: string;
  role?: string | null;
  [key: string]: unknown;
}

export interface FolderGroup<T extends GroupedBotItem = GroupedBotItem> {
  id: string;
  name: string;
  botIds: string[];
  bots: (T & { folderId: string })[];
}

export interface BotGroupingResult<T extends GroupedBotItem = GroupedBotItem> {
  /** Bots gruppiert nach Ordnern */
  folders: FolderGroup<T>[];
  /** Bots ohne Ordnerzuordnung */
  unfiledBots: (T & { folderId: null })[];
  /** Gesamtanzahl Bots in der Firma */
  totalBots: number;
}

/**
 * Gruppiert Bots anhand der Firmenzugehoerigkeit und Projektordner.
 *
 * @param allBots Alle verfuegbaren Bots/Agenten
 * @param companyAgentIds IDs der Bots, die der aktiven Firma zugeordnet sind
 * @param projects Liste der Ordner/Projekte mit ihren zugeordneten agentIds
 * @param search Optionaler Suchfilter
 */
export function groupBotsByFolder<T extends GroupedBotItem>(
  allBots: readonly T[],
  companyAgentIds: readonly string[],
  projects: readonly { id: string; name: string; agentIds: readonly string[] }[],
  search = "",
): BotGroupingResult<T> {
  const companyIdSet = new Set(companyAgentIds);
  const botMap = new Map<string, T>();

  for (const bot of allBots) {
    if (companyIdSet.has(bot.id)) {
      botMap.set(bot.id, bot);
    }
  }

  const query = search.trim().toLowerCase();
  const matchesSearch = (bot: T) => {
    if (!query) return true;
    const nameMatch = bot.name.toLowerCase().includes(query);
    const roleMatch = typeof bot.role === "string" && bot.role.toLowerCase().includes(query);
    return nameMatch || roleMatch;
  };

  const assignedToAnyFolder = new Set<string>();

  const folders: FolderGroup<T>[] = projects.map((p) => {
    const botsInFolder: (T & { folderId: string })[] = [];
    for (const id of p.agentIds) {
      assignedToAnyFolder.add(id);
      const bot = botMap.get(id);
      if (bot && matchesSearch(bot)) {
        botsInFolder.push({ ...bot, folderId: p.id });
      }
    }
    return {
      id: p.id,
      name: p.name,
      botIds: [...p.agentIds],
      bots: botsInFolder,
    };
  });

  const unfiledBots: (T & { folderId: null })[] = [];
  for (const [id, bot] of botMap.entries()) {
    if (!assignedToAnyFolder.has(id)) {
      if (matchesSearch(bot)) {
        unfiledBots.push({ ...bot, folderId: null });
      }
    }
  }

  return {
    folders,
    unfiledBots,
    totalBots: botMap.size,
  };
}
