/**
 * Handoff Module (v06 / Wave 1 - Agent A07)
 * 
 * Baut die MemoryHandoff-Struktur auf und formatiert sie als Start-Prompt für
 * die neue CLI bei einem Anbieterwechsel.
 */

import type { MemoryHandoff } from "../../contracts/v06/cli";
import { defaultSessionStore, type UnifiedMessage, type UnifiedSessionStore } from "./sessionStore";

/**
 * Extrahiert offene Aufgaben aus den Nachrichten einer Konversation.
 * Sucht nach Checkboxen `- [ ]` und `TODO:` Mustern.
 */
export function extractOpenTasks(messages: readonly UnifiedMessage[]): string[] {
  const tasks: string[] = [];
  const completedTasks = new Set<string>();

  // Reguläre Ausdrücke für Aufgaben
  const openCheckboxRegex = /^[-*+]\s*\[\s*\]\s+(.+)$/gm;
  const closedCheckboxRegex = /^[-*+]\s*\[[xX]\]\s+(.+)$/gm;
  const todoRegex = /^(?:TODO|Todo|Task):\s*(.+)$/gm;

  for (const msg of messages) {
    const text = msg.content;
    if (!text) continue;

    // Erledigte Aufgaben sammeln
    let match: RegExpExecArray | null;
    while ((match = closedCheckboxRegex.exec(text)) !== null) {
      if (match[1]) completedTasks.add(match[1].trim());
    }

    // Offene Checkboxen sammeln
    while ((match = openCheckboxRegex.exec(text)) !== null) {
      const task = match[1]?.trim();
      if (task && !completedTasks.has(task) && !tasks.includes(task)) {
        tasks.push(task);
      }
    }

    // TODO: sammeln
    while ((match = todoRegex.exec(text)) !== null) {
      const task = match[1]?.trim();
      if (task && !completedTasks.has(task) && !tasks.includes(task)) {
        tasks.push(task);
      }
    }
  }

  // Bereits erledigte Tasks ausfiltern
  return tasks.filter((t) => !completedTasks.has(t));
}

/**
 * Erstellt eine Zusammenfassung aus den vorhandenen Nachrichten.
 */
export function extractSummary(messages: readonly UnifiedMessage[], existingSummary?: string | null): string {
  if (existingSummary && existingSummary.trim().length > 0) {
    return existingSummary.trim();
  }

  if (messages.length === 0) {
    return "Neues Gespräch ohne bisherigen Verlauf.";
  }

  const firstUser = messages.find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const goal = firstUser ? firstUser.content.slice(0, 200).replace(/\s+/g, " ").trim() : "Allgemeine Assistenz";
  const lastState = lastAssistant ? lastAssistant.content.slice(0, 200).replace(/\s+/g, " ").trim() : "Gestartet";

  return `Hauptanliegen: "${goal}" | Letzter Stand: "${lastState}" (Insgesamt ${messages.length} Nachrichten).`;
}

/**
 * Baut die vollständige MemoryHandoff-Struktur für eine Konversation.
 */
export async function buildMemoryHandoff(
  conversationId: string,
  options?: {
    store?: UnifiedSessionStore;
    existingSummary?: string;
  },
): Promise<MemoryHandoff> {
  const store = options?.store ?? defaultSessionStore;
  const session = await store.getSession(conversationId);

  // Alle Nachrichten für Zusammenfassung und Aufgabenanalyse
  const allMessages = await store.getMessages(conversationId);

  // Exakt die letzten 20 Nachrichten für lastMessages
  const last20 = allMessages.length > 20 ? allMessages.slice(-20) : allMessages;

  const summary = extractSummary(allMessages, options?.existingSummary);
  const openTasks = extractOpenTasks(allMessages);

  const lastMessages = last20.map((m) => ({
    role: m.role,
    text: m.content,
    at: m.createdAt,
  }));

  return {
    conversationId,
    summary,
    lastMessages,
    openTasks,
    browserProfileId: session.browserProfileId,
  };
}

/**
 * Rendert eine MemoryHandoff-Struktur als klaren, lesbaren Prompt-Text
 * für den Start der neuen CLI-Sitzung.
 */
export function renderHandoffPrompt(handoff: MemoryHandoff): string {
  const lines: string[] = [];

  lines.push(`# GEDÄCHTNIS-ÜBERGABE (HANDOFF)`);
  lines.push(`Konversation: ${handoff.conversationId}`);
  if (handoff.browserProfileId) {
    lines.push(`Aktives Browser-Profil: ${handoff.browserProfileId}`);
  }
  lines.push("");

  lines.push(`## Zusammenfassung des bisherigen Kontexts`);
  lines.push(handoff.summary || "Keine Zusammenfassung vorhanden.");
  lines.push("");

  lines.push(`## Offene Aufgaben`);
  if (handoff.openTasks && handoff.openTasks.length > 0) {
    for (const task of handoff.openTasks) {
      lines.push(`- [ ] ${task}`);
    }
  } else {
    lines.push("Keine offenen Aufgaben explizit vermerkt.");
  }
  lines.push("");

  lines.push(`## Letzte Nachrichten (${handoff.lastMessages.length})`);
  if (handoff.lastMessages.length > 0) {
    for (const msg of handoff.lastMessages) {
      lines.push(`[${msg.at}] ${msg.role.toUpperCase()}: ${msg.text}`);
    }
  } else {
    lines.push("(Noch keine Nachrichten im Verlauf)");
  }
  lines.push("");

  lines.push(`---`);
  lines.push(
    `Du übernimmst diese Konversation nahtlos vom vorherigen Anbieter. Verwende dieselben Werkzeuge und dasselbe Browser-Profil. Fahre mit der Bearbeitung der offenen Aufgaben fort.`,
  );

  return lines.join("\n");
}
