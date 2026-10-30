/**
 * Connect Desktop Todos & Reminders (Lane 6).
 *
 * Verwaltet:
 * 1. Todos mit Uhrzeit, App- und URL-Verknüpfung
 * 2. Natürliche Sprache Parser für Todos & Erinnerungen (DE / EN)
 * 3. Formatierung von Notch-Karten (`notch.card.show`) & Toasts (`toast.show`)
 * 4. DB-Operationen für desktop_todos
 */

import { randomUUID } from "node:crypto";
import { eq, desc, and, lte } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  desktopTodos,
  type DesktopTodoRecord,
} from "../db/schema/desktop-routines";
import {
  type DesktopTodo,
  type CreateDesktopTodoInput,
  type UpdateDesktopTodoInput,
  type NotchCardShowParams,
  type ToastShowParams,
} from "../../../../packages/shared/src/desktop/contracts";
import {
  DEFAULT_TIMEZONE,
  parseDateTimeFromText,
  extractAppNames,
  extractUrls,
  removeSubstringIgnoreCase,
} from "./routines";

export interface ParsedTodo {
  title: string;
  description?: string;
  dueTime?: Date;
  reminderTime?: Date;
  reminderChannel: "notch_card" | "toast" | "both";
  associatedUrl?: string;
  associatedApp?: string;
  naturalLanguagePrompt: string;
}

/**
 * Parst ein Todo mit Zeit und Kontext aus natürlicher Sprache.
 * Beispiele:
 * - „Erinnere mich morgen um 14:00 an Meeting mit Stefan“
 * - „Todo heute 17:30 Einkaufen gehen“
 * - „In 10 Minuten Wäsche aufhängen“
 * - „Dokument auf https://docs.google.com/doc1 bis 16 Uhr prüfen“
 * - „Code in VS Code fertigstellen um 18:00“
 */
export function parseNaturalLanguageTodo(
  prompt: string,
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): ParsedTodo {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  const dtResult = parseDateTimeFromText(trimmed, now, timezone);
  const dueTime = dtResult ? dtResult.date : undefined;

  // Standardmäßig Erinnerung zum Fälligkeitszeitpunkt
  const reminderTime = dueTime ? new Date(dueTime.getTime()) : undefined;

  const urls = extractUrls(trimmed);
  const apps = extractAppNames(trimmed);

  const associatedUrl = urls[0];
  const associatedApp = apps[0];

  // Titel bereinigen
  let title = trimmed;
  if (dtResult) {
    title = removeSubstringIgnoreCase(title, dtResult.matchedText);
  }
  if (associatedUrl) {
    title = removeSubstringIgnoreCase(title, associatedUrl);
  }

  // Füllwörter und Präfixe entfernen
  title = title
    .replace(/\b(?:erinnere mich|erinner mich|erinnerung|todo|aufgabe|task|remind me|remind)\b/gi, "")
    .replace(/\b(?:an|daran|bis|um|at|on|for|to|auf)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Falls leer, Fallback
  if (!title) {
    title = associatedApp ? `Aufgabe in ${associatedApp}` : "Neue Desktop-Aufgabe";
  }

  // Erstes Zeichen groß
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    title,
    description: `Erstellt via Sprach-/Texteingabe: "${trimmed}"`,
    dueTime,
    reminderTime,
    reminderChannel: "both",
    associatedUrl,
    associatedApp,
    naturalLanguagePrompt: trimmed,
  };
}

/**
 * Erstellt eine Notch-Aktionskarte für ein fälliges Todo.
 */
export function formatNotchCardForTodo(todo: DesktopTodoRecord): NotchCardShowParams {
  const dueStr = todo.dueTime
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: DEFAULT_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(todo.dueTime))
    : "Jetzt";

  const contextInfo = [
    todo.associatedApp ? `App: ${todo.associatedApp}` : null,
    todo.associatedUrl ? `URL: ${todo.associatedUrl}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    cardId: `card-todo-${todo.id}`,
    type: "routine",
    title: `Erinnerung: ${todo.title}`,
    message: contextInfo ? `Fällig: ${dueStr} (${contextInfo})` : `Fällig: ${dueStr}`,
    accentColor: "#6366F1", // Indigo
    icon: "clock",
    buttons: [
      { id: `todo_done_${todo.id}`, label: "Erledigt", variant: "primary" },
      { id: `todo_snooze_${todo.id}`, label: "15 Min später", variant: "secondary" },
    ],
    timeoutMs: 10000,
  };
}

/**
 * Erstellt einen Windows-Toast für ein fälliges Todo.
 */
export function formatToastForTodo(todo: DesktopTodoRecord): ToastShowParams {
  const dueStr = todo.dueTime
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: DEFAULT_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(todo.dueTime))
    : "Jetzt";

  return {
    title: `Connect To-Do: ${todo.title}`,
    message: `Fällig um ${dueStr}${todo.associatedApp ? ` (${todo.associatedApp})` : ""}`,
    actionUrl: todo.associatedUrl ?? undefined,
    durationMs: 5000,
  };
}

/**
 * Service für Todo-CRUD und Erinnerungen.
 */
export class DesktopTodosService {
  constructor(private db?: Database) {}

  public setDatabase(db: Database): void {
    this.db = db;
  }

  /**
   * Legt ein neues Todo an.
   */
  public async createTodo(
    input: CreateDesktopTodoInput & {
      reminderTime?: Date;
      reminderChannel?: "notch_card" | "toast" | "both";
    },
  ): Promise<DesktopTodoRecord> {
    if (!this.db) throw new Error("Database not configured");

    const id = `todo-${randomUUID()}`;
    const dueTime = input.dueTime ? new Date(input.dueTime) : null;
    const reminderTime = input.reminderTime ?? dueTime ?? null;

    const [record] = await this.db
      .insert(desktopTodos)
      .values({
        id,
        title: input.title,
        description: input.description ?? null,
        dueTime,
        completed: input.completed ?? false,
        associatedUrl: input.associatedUrl ?? null,
        associatedApp: input.associatedApp ?? null,
        reminderSent: false,
        reminderTime,
        reminderChannel: input.reminderChannel ?? "both",
      })
      .returning();

    return record;
  }

  /**
   * Erstellt ein Todo aus natürlicher Sprache.
   */
  public async createTodoFromPrompt(
    prompt: string,
    options?: { timezone?: string },
  ): Promise<DesktopTodoRecord> {
    const parsed = parseNaturalLanguageTodo(prompt, new Date(), options?.timezone || DEFAULT_TIMEZONE);
    return this.createTodo({
      title: parsed.title,
      description: parsed.description,
      dueTime: parsed.dueTime?.toISOString(),
      reminderTime: parsed.reminderTime,
      reminderChannel: parsed.reminderChannel,
      associatedUrl: parsed.associatedUrl,
      associatedApp: parsed.associatedApp,
      completed: false,
    });
  }

  /**
   * Listet Todos mit optionalem Filter nach Abschluss.
   */
  public async listTodos(options?: { completed?: boolean }): Promise<DesktopTodoRecord[]> {
    if (!this.db) throw new Error("Database not configured");
    if (options?.completed !== undefined) {
      return this.db
        .select()
        .from(desktopTodos)
        .where(eq(desktopTodos.completed, options.completed))
        .orderBy(desc(desktopTodos.createdAt));
    }
    return this.db.select().from(desktopTodos).orderBy(desc(desktopTodos.createdAt));
  }

  /**
   * Ruft ein Todo anhand der ID ab.
   */
  public async getTodoById(id: string): Promise<DesktopTodoRecord | undefined> {
    if (!this.db) throw new Error("Database not configured");
    const records = await this.db.select().from(desktopTodos).where(eq(desktopTodos.id, id));
    return records[0];
  }

  /**
   * Aktualisiert ein Todo.
   */
  public async updateTodo(
    id: string,
    updates: UpdateDesktopTodoInput & {
      completedAt?: Date | null;
      reminderTime?: Date;
      reminderChannel?: "notch_card" | "toast" | "both";
      reminderSent?: boolean;
    },
  ): Promise<DesktopTodoRecord | undefined> {
    if (!this.db) throw new Error("Database not configured");

    const patch: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.dueTime !== undefined) {
      patch.dueTime = updates.dueTime ? new Date(updates.dueTime) : null;
    }
    if (updates.reminderTime !== undefined) {
      patch.reminderTime = updates.reminderTime;
    }
    if (updates.completed === true) {
      patch.completedAt = new Date();
    }

    const [updated] = await this.db
      .update(desktopTodos)
      .set(patch)
      .where(eq(desktopTodos.id, id))
      .returning();

    return updated;
  }

  /**
   * Markiert ein Todo als abgeschlossen.
   */
  public async completeTodo(id: string): Promise<DesktopTodoRecord | undefined> {
    return this.updateTodo(id, {
      completed: true,
    });
  }

  /**
   * Markiert eine Erinnerung als gesendet.
   */
  public async markReminderSent(id: string): Promise<void> {
    if (!this.db) return;
    await this.db
      .update(desktopTodos)
      .set({ reminderSent: true, updatedAt: new Date() })
      .where(eq(desktopTodos.id, id));
  }

  /**
   * Löscht ein Todo.
   */
  public async deleteTodo(id: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not configured");
    const res = await this.db.delete(desktopTodos).where(eq(desktopTodos.id, id)).returning();
    return res.length > 0;
  }

  /**
   * Findet alle fälligen Erinnerungen, die noch nicht verschickt wurden.
   */
  public async getDueReminders(now = new Date()): Promise<DesktopTodoRecord[]> {
    if (!this.db) return [];
    return this.db
      .select()
      .from(desktopTodos)
      .where(
        and(
          eq(desktopTodos.completed, false),
          eq(desktopTodos.reminderSent, false),
          lte(desktopTodos.reminderTime, now),
        ),
      );
  }
}
