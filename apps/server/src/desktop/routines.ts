/**
 * Connect Desktop Routines & Planned Actions (Lane 6).
 *
 * Verwaltet:
 * 1. Natürliche Sprache Parser für Routinen & geplante Aktionen (DE / EN)
 * 2. Cron & Once-Schedules mit Zeitzone Europe/Berlin
 * 3. Geplante Suchen („Amazon nach Geschenkpapier 10. Nov 11:00“)
 * 4. DB-Operationen für desktop_routines und desktop_planned_searches
 * 5. Nachholen-Policy („run_once“ | „skip“ | „run_all“) wenn Host offline war
 */

import { randomUUID } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { eq, desc, and } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  desktopRoutines,
  desktopPlannedSearches,
  type DesktopRoutineRecord,
  type DesktopPlannedSearchRecord,
} from "../db/schema/desktop-routines";
import {
  type DesktopAction,
  type CreateDesktopRoutineInput,
  type UpdateDesktopRoutineInput,
} from "../../../../packages/shared/src/desktop/contracts";

export const DEFAULT_TIMEZONE = "Europe/Berlin";

export type CatchUpPolicy = "run_once" | "skip" | "run_all";
export type ScheduleType = "cron" | "once";

export interface ParsedRoutine {
  name: string;
  description?: string;
  cronExpression: string;
  scheduleType: ScheduleType;
  triggerAt?: Date;
  actions: DesktopAction[];
  catchUpPolicy: CatchUpPolicy;
  naturalLanguagePrompt: string;
}

export interface ParsedPlannedSearch {
  query: string;
  targetPlatform: "amazon" | "youtube" | "google" | "helium" | "web";
  targetUrl: string;
  scheduledTime: Date;
  preferHelium: boolean;
  actions: DesktopAction[];
  naturalLanguagePrompt: string;
}

/**
 * Case-insensitive Substring-Entfernung.
 */
export function removeSubstringIgnoreCase(str: string, substr: string): string {
  const idx = str.toLowerCase().indexOf(substr.toLowerCase());
  if (idx === -1) return str;
  return str.slice(0, idx) + str.slice(idx + substr.length);
}

/**
 * Errechnet den nächsten Ausführungszeitpunkt basierend auf Cron oder Once.
 */
export function calculateNextRun(
  cronExpression: string,
  scheduleType: ScheduleType,
  triggerAt?: Date | null,
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): Date | null {
  if (scheduleType === "once") {
    if (!triggerAt) return null;
    return triggerAt > now ? triggerAt : null;
  }

  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: now,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

/**
 * Parst Zeitangaben wie:
 * - "9:00", "08:30", "14 Uhr", "14:15 Uhr"
 * - "10. Nov 11:00", "10.11. 11:00", "am 25.12. um 09:00"
 * - "in 1 Minute", "in 5 Minuten", "in 2 Stunden"
 * - "morgen um 14:00", "übermorgen 10:00"
 */
export function parseDateTimeFromText(
  text: string,
  baseDate = new Date(),
  timezone = DEFAULT_TIMEZONE,
): { date: Date; matchedText: string } | null {
  // 1. Relative Zeit: "in X Minute(n)", "in X Sekunde(n)", "in X Stunde(n)"
  const relMinMatch = text.match(/\bin\s+(\d+)\s*(?:minuten?|mins?|m)\b/i);
  if (relMinMatch) {
    const minutes = parseInt(relMinMatch[1], 10);
    const target = new Date(baseDate.getTime() + minutes * 60 * 1000);
    return { date: target, matchedText: relMinMatch[0] };
  }

  const relHourMatch = text.match(/\bin\s+(\d+)\s*(?:stunden?|hrs?|h)\b/i);
  if (relHourMatch) {
    const hours = parseInt(relHourMatch[1], 10);
    const target = new Date(baseDate.getTime() + hours * 3600 * 1000);
    return { date: target, matchedText: relHourMatch[0] };
  }

  const relSecMatch = text.match(/\bin\s+(\d+)\s*(?:sekunden?|secs?|s)\b/i);
  if (relSecMatch) {
    const secs = parseInt(relSecMatch[1], 10);
    const target = new Date(baseDate.getTime() + secs * 1000);
    return { date: target, matchedText: relSecMatch[0] };
  }

  // 2. Datum mit Monatsnamen: z. B. "10. Nov 11:00", "10. November 11:00"
  const monthNames: Record<string, number> = {
    januar: 0, january: 0, jan: 0,
    februar: 1, february: 1, feb: 1,
    maerz: 2, märz: 2, mär: 2, mrz: 2, march: 2, mar: 2,
    april: 3, apr: 3,
    mai: 4, may: 4,
    juni: 5, june: 5, jun: 5,
    juli: 6, july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sept: 8, sep: 8,
    oktober: 9, october: 9, okt: 9, oct: 9,
    november: 10, nov: 10,
    dezember: 11, december: 11, dez: 11, dec: 11,
  };

  const monthRegex = new RegExp(
    `(?:am\\s+)?(\\d{1,2})\\.?\\s+(${Object.keys(monthNames).join("|")})\\.?\\s+(?:um\\s+)?(\\d{1,2}):?(\\d{2})?\\s*(?:uhr)?`,
    "i",
  );
  const monthMatch = text.match(monthRegex);
  if (monthMatch) {
    const day = parseInt(monthMatch[1], 10);
    const month = monthNames[monthMatch[2].toLowerCase()];
    const hour = parseInt(monthMatch[3], 10);
    const minute = monthMatch[4] ? parseInt(monthMatch[4], 10) : 0;
    const year = baseDate.getFullYear();

    const d = new Date(baseDate);
    d.setFullYear(year, month, day);
    d.setHours(hour, minute, 0, 0);

    if (d.getTime() < baseDate.getTime()) {
      d.setFullYear(year + 1);
    }
    return { date: d, matchedText: monthMatch[0] };
  }

  // 3. Numerisches Datum: z. B. "10.11. 11:00" oder "25.12. um 09:00"
  const numDateMatch = text.match(
    /(?:am\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(?:(\\d{4}))?\\s*(?:um\\s+)?(\\d{1,2}):?(\\d{2})?\\s*(?:uhr)?/i,
  );
  if (numDateMatch) {
    const day = parseInt(numDateMatch[1], 10);
    const month = parseInt(numDateMatch[2], 10) - 1;
    const year = numDateMatch[3] ? parseInt(numDateMatch[3], 10) : baseDate.getFullYear();
    const hour = parseInt(numDateMatch[4], 10);
    const minute = numDateMatch[5] ? parseInt(numDateMatch[5], 10) : 0;

    const d = new Date(baseDate);
    d.setFullYear(year, month, day);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() < baseDate.getTime() && !numDateMatch[3]) {
      d.setFullYear(year + 1);
    }
    return { date: d, matchedText: numDateMatch[0] };
  }

  // 4. "morgen um 14:00" / "tomorrow at 14:00" (nicht "jeden morgen"!)
  const isJedenMorgen = /\bjeden\s+morgen\b/i.test(text);
  if (!isJedenMorgen) {
    const tomorrowMatch = text.match(/\b(?:morgen|tomorrow)\s*(?:um|at)?\s*(\d{1,2}):?(\d{2})?\s*(?:uhr)?/i);
    if (tomorrowMatch) {
      const hour = parseInt(tomorrowMatch[1], 10);
      const minute = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 1);
      d.setHours(hour, minute, 0, 0);
      return { date: d, matchedText: tomorrowMatch[0] };
    }
  }

  // 5. "heute um 18:00" / "today at 18:00"
  const todayMatch = text.match(/\b(?:heute|today)\s*(?:um|at)?\s*(\d{1,2}):?(\d{2})?\s*(?:uhr)?/i);
  if (todayMatch) {
    const hour = parseInt(todayMatch[1], 10);
    const minute = todayMatch[2] ? parseInt(todayMatch[2], 10) : 0;
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    return { date: d, matchedText: todayMatch[0] };
  }

  return null;
}

/**
 * Ermittelt eine Plattform-Such-URL anhand von Plattform und Query.
 */
export function buildPlatformSearchUrl(platform: string, query: string): string {
  const enc = encodeURIComponent(query.trim());
  switch (platform.toLowerCase()) {
    case "amazon":
      return `https://www.amazon.de/s?k=${enc}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${enc}`;
    case "google":
      return `https://www.google.com/search?q=${enc}`;
    case "helium":
    case "web":
    default:
      return `https://www.google.com/search?q=${enc}`;
  }
}

/**
 * Erkennt bekannte Desktop-Apps in einem Text.
 */
export function extractAppNames(text: string): string[] {
  const knownApps = [
    "Unity",
    "Spotify",
    "Slack",
    "Chrome",
    "Notepad",
    "VS Code",
    "Visual Studio Code",
    "Discord",
    "Steam",
    "Helium",
    "Terminal",
    "Firefox",
    "Edge",
    "Calculator",
    "Outlook",
    "Word",
    "Excel",
  ];

  const found: string[] = [];
  for (const app of knownApps) {
    const regex = new RegExp(`\\b${app.replace(/ /g, "\\s+")}\\b`, "i");
    if (regex.test(text)) {
      found.push(app);
    }
  }
  return found;
}

/**
 * Erkennt URLs im Text.
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
  const matches = text.match(urlRegex) || [];
  return matches.map((u) => (u.startsWith("http") ? u : `https://${u}`));
}

/**
 * Parst eine geplante Suche aus natürlicher Sprache.
 * Beispiel: „Amazon nach Geschenkpapier 10. Nov 11:00“
 */
export function parsePlannedSearch(
  prompt: string,
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): ParsedPlannedSearch | null {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  // Wiederkehrende Routinen sind keine einmaligen geplanten Suchen
  if (/\b(?:jeden|täglich|alle|daily|every|stündlich)\b/i.test(lower)) {
    return null;
  }

  // Erkennt Plattformen oder Suchabsicht
  let platform: "amazon" | "youtube" | "google" | "helium" | "web" | null = null;
  if (/\bamazon\b/i.test(lower)) platform = "amazon";
  else if (/\byoutube\b/i.test(lower)) platform = "youtube";
  else if (/\bgoogle\b/i.test(lower)) platform = "google";
  else if (/\bhelium\b/i.test(lower)) platform = "helium";
  else if (/\b(?:suche|suchen|search|durchsuche)\b/i.test(lower)) platform = "web";

  if (!platform) {
    return null;
  }

  const dtResult = parseDateTimeFromText(trimmed, now, timezone);
  if (!dtResult) {
    return null;
  }

  // Entferne Zeitangabe und Plattform-Keywords für die Suchanfrage
  let queryText = removeSubstringIgnoreCase(trimmed, dtResult.matchedText);
  queryText = queryText.replace(new RegExp(`\\b${platform}\\b`, "i"), "");
  queryText = queryText.replace(/\b(?:nach|search for|suche nach|suchen nach|nach|durchsuchen|finde|um|at|am)\b/gi, "");
  const cleanQuery = queryText.trim().replace(/^["']|["']$/g, "").trim();

  if (!cleanQuery) return null;

  const targetUrl = buildPlatformSearchUrl(platform, cleanQuery);

  const action: DesktopAction = {
    type: "open_url",
    risk: "act",
    targetDescription: `Suche auf ${platform.toUpperCase()}: ${cleanQuery}`,
    openUrl: {
      url: targetUrl,
      preferHelium: true,
      newWindow: false,
    },
  };

  return {
    query: cleanQuery,
    targetPlatform: platform,
    targetUrl,
    scheduledTime: dtResult.date,
    preferHelium: true,
    actions: [action],
    naturalLanguagePrompt: prompt,
  };
}

/**
 * Hauptparser für natürliche Sprache zu Routinen (Cron oder Once).
 * Beispiele:
 * - „jeden Morgen 9:00 Unity + Spotify“ -> 0 9 * * *, [open_app Unity, open_app Spotify]
 * - „jeden Werktag 08:30 Slack und Chrome“ -> 30 8 * * 1-5, [open_app Slack, open_app Chrome]
 * - „jeden Montag 10:00 Weekly Standup auf meet.google.com/abc“ -> 0 10 * * 1, [open_url ...]
 * - „Amazon nach Geschenkpapier 10. Nov 11:00“ -> once
 * - „in 1 Minute Notepad öffnen“ -> once
 */
export function parseNaturalLanguageRoutine(
  prompt: string,
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): ParsedRoutine {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  // 1. Prüfe auf einmalige geplante Suche
  const plannedSearch = parsePlannedSearch(trimmed, now, timezone);
  if (plannedSearch) {
    return {
      name: `Suche ${plannedSearch.targetPlatform.toUpperCase()}: ${plannedSearch.query}`,
      description: `Geplante Suche via Prompt: "${trimmed}"`,
      cronExpression: "@once",
      scheduleType: "once",
      triggerAt: plannedSearch.scheduledTime,
      actions: plannedSearch.actions,
      catchUpPolicy: "run_once",
      naturalLanguagePrompt: trimmed,
    };
  }

  // 2. Prüfe auf einmalige relative Zeit („in 1 Minute Notepad öffnen“)
  const dtOnce = parseDateTimeFromText(trimmed, now, timezone);
  const isExplicitOnce =
    /\b(?:in\s+\d+|am\s+\d+|morgen|tomorrow|heute\s+um)\b/i.test(trimmed) &&
    !/\bjeden|täglich|alle|daily|every|stündlich\b/i.test(trimmed);

  if (isExplicitOnce && dtOnce) {
    const apps = extractAppNames(trimmed);
    const urls = extractUrls(trimmed);
    const actions: DesktopAction[] = [];

    for (const app of apps) {
      actions.push({
        type: "open_app",
        risk: "act",
        targetDescription: `Starte App: ${app}`,
        openApp: { appName: app },
      });
    }

    for (const url of urls) {
      actions.push({
        type: "open_url",
        risk: "act",
        targetDescription: `Öffne URL: ${url}`,
        openUrl: { url, preferHelium: true, newWindow: false },
      });
    }

    if (actions.length === 0) {
      actions.push({
        type: "open_app",
        risk: "act",
        targetDescription: `Aktion für: ${trimmed}`,
        openApp: { appName: "Notepad" },
      });
    }

    return {
      name: `Einmalige Aktion: ${apps.join(" + ") || urls.join(" ") || "Desktop-Aktion"}`,
      description: `Einmalig geplant für ${dtOnce.date.toISOString()}`,
      cronExpression: "@once",
      scheduleType: "once",
      triggerAt: dtOnce.date,
      actions,
      catchUpPolicy: "run_once",
      naturalLanguagePrompt: trimmed,
    };
  }

  // 3. Wiederkehrende Routinen (Cron)
  let cron = "0 9 * * *"; // Standard 9:00 täglich
  let name = "Desktop-Routine";

  // Wochentag(e) ermitteln
  let daysOfWeek = "*";
  if (/\b(?:werktag|werktags|mo-fr|wochentags|weekdays?)\b/i.test(lower)) {
    daysOfWeek = "1-5";
  } else if (/\b(?:wochenende|weekend)\b/i.test(lower)) {
    daysOfWeek = "6,0";
  } else if (/\bmontag|monday\b/i.test(lower)) {
    daysOfWeek = "1";
  } else if (/\bdienstag|tuesday\b/i.test(lower)) {
    daysOfWeek = "2";
  } else if (/\bmittwoch|wednesday\b/i.test(lower)) {
    daysOfWeek = "3";
  } else if (/\bdonnerstag|thursday\b/i.test(lower)) {
    daysOfWeek = "4";
  } else if (/\bfreitag|friday\b/i.test(lower)) {
    daysOfWeek = "5";
  } else if (/\bsamstag|saturday\b/i.test(lower)) {
    daysOfWeek = "6";
  } else if (/\bsonntag|sunday\b/i.test(lower)) {
    daysOfWeek = "0";
  }

  // Intervall alle X Minuten: "alle 30 Minuten", "every 15 minutes"
  const intervalMatch = lower.match(/\balle\s+(\d+)\s*(?:minuten?|mins?)\b/i);
  if (intervalMatch) {
    const mins = parseInt(intervalMatch[1], 10);
    cron = `*/${mins} * * * *`;
    name = `Alle ${mins} Minuten Routine`;
  } else if (/\bstündlich|hourly\b/i.test(lower)) {
    cron = `0 * * * *`;
    name = "Stündliche Routine";
  } else {
    // Uhrzeit finden: "9:00", "08:30", "14 Uhr", "10:00"
    const timeMatch = lower.match(/\b(\d{1,2}):?(\d{2})?\s*(?:uhr)?\b/);
    let hour = 9;
    let minute = 0;
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    } else if (/\bmorgen\b/i.test(lower)) {
      hour = 9;
    } else if (/\bmittag\b/i.test(lower)) {
      hour = 12;
    } else if (/\babend\b/i.test(lower)) {
      hour = 18;
    }
    cron = `${minute} ${hour} * * ${daysOfWeek}`;
  }

  // Aktionen ermitteln
  const apps = extractAppNames(trimmed);
  const urls = extractUrls(trimmed);
  const actions: DesktopAction[] = [];

  for (const app of apps) {
    actions.push({
      type: "open_app",
      risk: "act",
      targetDescription: `Starte ${app}`,
      openApp: { appName: app },
    });
  }

  for (const url of urls) {
    actions.push({
      type: "open_url",
      risk: "act",
      targetDescription: `Öffne ${url}`,
      openUrl: { url, preferHelium: true, newWindow: false },
    });
  }

  if (actions.length === 0) {
    actions.push({
      type: "open_app",
      risk: "act",
      targetDescription: `Aktion: ${trimmed}`,
      openApp: { appName: "Notepad" },
    });
  }

  if (apps.length > 0) {
    name = `Routine: ${apps.join(" + ")}`;
  } else if (urls.length > 0) {
    name = `Routine: ${urls.join(", ")}`;
  }

  return {
    name,
    description: `Automatisch erstellt aus: "${trimmed}"`,
    cronExpression: cron,
    scheduleType: "cron",
    actions,
    catchUpPolicy: "run_once",
    naturalLanguagePrompt: trimmed,
  };
}

/**
 * Service für Routine-CRUD und Scheduler-Interaktion.
 */
export class DesktopRoutinesService {
  constructor(private db?: Database) {}

  public setDatabase(db: Database): void {
    this.db = db;
  }

  /**
   * Erstellt eine Routine direkt oder aus einem Schema-Input.
   */
  public async createRoutine(
    input: CreateDesktopRoutineInput & {
      scheduleType?: ScheduleType;
      triggerAt?: Date;
      catchUpPolicy?: CatchUpPolicy;
      naturalLanguagePrompt?: string;
    },
  ): Promise<DesktopRoutineRecord> {
    if (!this.db) throw new Error("Database not configured in DesktopRoutinesService");

    const id = `rout-${randomUUID()}`;
    const scheduleType = input.scheduleType || (input.cronExpression === "@once" ? "once" : "cron");
    const nextRun = calculateNextRun(
      input.cronExpression,
      scheduleType,
      input.triggerAt,
      new Date(),
      DEFAULT_TIMEZONE,
    );

    const [record] = await this.db
      .insert(desktopRoutines)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        cronExpression: input.cronExpression,
        scheduleType,
        triggerAt: input.triggerAt ?? null,
        naturalLanguagePrompt: input.naturalLanguagePrompt ?? null,
        enabled: input.enabled ?? true,
        actions: input.actions ?? [],
        targetAgentId: input.targetAgentId ?? null,
        catchUpPolicy: input.catchUpPolicy ?? "run_once",
        nextRunAt: nextRun,
      })
      .returning();

    return record;
  }

  /**
   * Erstellt eine Routine aus natürlicher Sprache.
   */
  public async createRoutineFromPrompt(
    prompt: string,
    options?: { targetAgentId?: string; timezone?: string },
  ): Promise<DesktopRoutineRecord> {
    const parsed = parseNaturalLanguageRoutine(prompt, new Date(), options?.timezone || DEFAULT_TIMEZONE);
    return this.createRoutine({
      name: parsed.name,
      description: parsed.description,
      cronExpression: parsed.cronExpression,
      scheduleType: parsed.scheduleType,
      triggerAt: parsed.triggerAt,
      actions: parsed.actions,
      catchUpPolicy: parsed.catchUpPolicy,
      naturalLanguagePrompt: parsed.naturalLanguagePrompt,
      targetAgentId: options?.targetAgentId,
      enabled: true,
    });
  }

  /**
   * Listet alle Routinen.
   */
  public async listRoutines(filter?: { enabled?: boolean }): Promise<DesktopRoutineRecord[]> {
    if (!this.db) throw new Error("Database not configured");
    if (filter?.enabled !== undefined) {
      return this.db
        .select()
        .from(desktopRoutines)
        .where(eq(desktopRoutines.enabled, filter.enabled))
        .orderBy(desc(desktopRoutines.createdAt));
    }
    return this.db.select().from(desktopRoutines).orderBy(desc(desktopRoutines.createdAt));
  }

  /**
   * Sucht Routine anhand der ID.
   */
  public async getRoutineById(id: string): Promise<DesktopRoutineRecord | undefined> {
    if (!this.db) throw new Error("Database not configured");
    const records = await this.db.select().from(desktopRoutines).where(eq(desktopRoutines.id, id));
    return records[0];
  }

  /**
   * Aktualisiert eine Routine.
   */
  public async updateRoutine(
    id: string,
    updates: UpdateDesktopRoutineInput & {
      scheduleType?: ScheduleType;
      triggerAt?: Date;
      catchUpPolicy?: CatchUpPolicy;
    },
  ): Promise<DesktopRoutineRecord | undefined> {
    if (!this.db) throw new Error("Database not configured");

    const existing = await this.getRoutineById(id);
    if (!existing) return undefined;

    const cronExpr = updates.cronExpression ?? existing.cronExpression;
    const schedType = (updates.scheduleType ?? existing.scheduleType) as ScheduleType;
    const trigAt = updates.triggerAt !== undefined ? updates.triggerAt : existing.triggerAt;

    const nextRun = calculateNextRun(cronExpr, schedType, trigAt, new Date(), DEFAULT_TIMEZONE);

    const [updated] = await this.db
      .update(desktopRoutines)
      .set({
        ...updates,
        nextRunAt: nextRun,
        updatedAt: new Date(),
      })
      .where(eq(desktopRoutines.id, id))
      .returning();

    return updated;
  }

  /**
   * Löscht eine Routine.
   */
  public async deleteRoutine(id: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not configured");
    const res = await this.db.delete(desktopRoutines).where(eq(desktopRoutines.id, id)).returning();
    return res.length > 0;
  }

  /**
   * Legt eine geplante Suche an.
   */
  public async createPlannedSearch(input: {
    query: string;
    targetPlatform?: "amazon" | "youtube" | "google" | "helium" | "web";
    targetUrl?: string;
    scheduledTime: Date;
    preferHelium?: boolean;
    routineId?: string;
  }): Promise<DesktopPlannedSearchRecord> {
    if (!this.db) throw new Error("Database not configured");

    const platform = input.targetPlatform || "web";
    const targetUrl = input.targetUrl || buildPlatformSearchUrl(platform, input.query);
    const id = `srch-${randomUUID()}`;

    const action: DesktopAction = {
      type: "open_url",
      risk: "act",
      targetDescription: `Suche auf ${platform.toUpperCase()}: ${input.query}`,
      openUrl: {
        url: targetUrl,
        preferHelium: input.preferHelium ?? true,
        newWindow: false,
      },
    };

    const [record] = await this.db
      .insert(desktopPlannedSearches)
      .values({
        id,
        query: input.query,
        targetPlatform: platform,
        targetUrl,
        scheduledTime: input.scheduledTime,
        status: "pending",
        preferHelium: input.preferHelium ?? true,
        actions: [action],
        routineId: input.routineId ?? null,
      })
      .returning();

    return record;
  }

  /**
   * Listet geplante Suchen.
   */
  public async listPlannedSearches(filter?: { status?: string }): Promise<DesktopPlannedSearchRecord[]> {
    if (!this.db) throw new Error("Database not configured");
    if (filter?.status) {
      return this.db
        .select()
        .from(desktopPlannedSearches)
        .where(eq(desktopPlannedSearches.status, filter.status))
        .orderBy(desktopPlannedSearches.scheduledTime);
    }
    return this.db.select().from(desktopPlannedSearches).orderBy(desktopPlannedSearches.scheduledTime);
  }
}
