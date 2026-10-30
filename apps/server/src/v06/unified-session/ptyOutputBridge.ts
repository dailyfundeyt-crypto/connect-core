/**
 * PTY Output Bridge (v06 / A22 Follow-up)
 *
 * Nimmt Terminal-Ausgaben (PTY-Streams) von Agenten auf, filtert ANSI-Codes,
 * Status-Banner, Echos und Prompts heraus, puffert zusammenhängende Antworten
 * und speichert fertige Antworten im gemeinsamen Verlauf (conversation_messages)
 * mit role='assistant' und source='cli'.
 *
 * Schutzregeln:
 * - Nur gebundene runtimeAgentId -> conversationId Zuordnungen werden verarbeitet.
 * - Generationen-Schutz: Ausgaben früherer Generationen (vor Anbieterwechsel)
 *   werden verworfen und niemals dem neuen Gespräch zugeschrieben.
 * - Idempotenz: Bereits gespeicherte Antworten werden nicht dupliziert.
 */

import { defaultSessionStore, type UnifiedMessage, type UnifiedSessionStore } from "./sessionStore";

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "")
    .replace(/\u001b[@-_]/g, "");
}

/**
 * Normalisiert Zeilen mit Carriage Returns (\r).
 * In Terminals überschreiben Zeichen nach einem \r oft frühere Inhalte (z.B. Spinner/Fortschritt).
 */
export function normalizeCarriageReturns(text: string): string {
  const lines = text.split("\n");
  const processed = lines.map((line) => {
    if (!line.includes("\r")) return line;
    const parts = line.split("\r");
    return parts[parts.length - 1];
  });
  return processed.join("\n");
}

/**
 * Erkennt technische System- und Statuszeilen, die nicht Teil der fachlichen Antwort sind.
 */
export function isTechnicalBanner(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^---\s*\[.*?\]\s*.*?\s*---$/.test(trimmed)) return true;
  if (/^---\s*\[agy-share\].*?---$/i.test(trimmed)) return true;
  if (/^---\s*\[Skills\].*?---$/i.test(trimmed)) return true;
  if (/^---\s*\[Anbieterwechsel\].*?---$/i.test(trimmed)) return true;
  if (/^\[Connect\s*·\s*Kontext-Übergabe\]/i.test(trimmed)) return true;
  if (/^\[Anbieterwechsel\]/i.test(trimmed)) return true;
  if (/^Terminal (gestartet|beendet|Fehler):/i.test(trimmed)) return true;
  return false;
}

/**
 * Entfernt trailing Prompts am Ende der Terminal-Ausgabe.
 */
export function stripTrailingPrompt(text: string): string {
  let cleaned = text.trimEnd();
  // Häufige CLI-Prompts
  const promptPatterns = [
    /\n?\s*(?:>|❯|\?|antigravity>|codex>|claude>|gemini>|freebuff>)\s*$/i,
    /\n?\s*\[.*?\]\s*(?:>|❯|\?)\s*$/i,
    /\n?\s*\$\s*$/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of promptPatterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, "").trimEnd();
        changed = true;
      }
    }
  }
  return cleaned;
}

/**
 * Entfernt führendes Echo der Benutzereingabe, falls die PTY den Prompt wiederholt hat.
 */
export function stripUserInputEcho(text: string, userInput?: string): string {
  if (!userInput || !userInput.trim()) return text;
  const normalizedInput = userInput.trim();
  let result = text.trimStart();

  // Führende Prompts vor dem Echo entfernen (z.B. "> Wie spät ist es?")
  const promptPrefix = /^(?:>|❯|\?|antigravity>|codex>|claude>|gemini>|freebuff>|\$)\s*/i;
  const match = promptPrefix.exec(result);
  const withoutPrompt = match ? result.slice(match[0].length) : result;

  if (withoutPrompt.startsWith(normalizedInput)) {
    result = withoutPrompt.slice(normalizedInput.length).trimStart();
  } else if (result.startsWith(normalizedInput)) {
    result = result.slice(normalizedInput.length).trimStart();
  }
  return result;
}

/**
 * Bereinigt die rohe Terminal-Ausgabe vollständig:
 * 1. ANSI-Codes entfernen
 * 2. \r-Überschreibungen auflösen
 * 3. Technische Banner ausfiltern
 * 4. Echo der Benutzereingabe entfernen
 * 5. Abschließende Prompts entfernen
 */
export function cleanTerminalOutput(rawText: string, userInput?: string): string {
  if (!rawText) return "";

  // 1. ANSI Codes entfernen
  const noAnsi = stripAnsi(rawText);

  // 2. Carriage Returns normalisieren
  const noCr = normalizeCarriageReturns(noAnsi);

  // 3. Zeilenweise filtern (technische Banner entfernen)
  const lines = noCr.split("\n");
  const filteredLines = lines.filter((l) => !isTechnicalBanner(l));
  let combined = filteredLines.join("\n");

  // 4. Echo der Benutzereingabe entfernen
  combined = stripUserInputEcho(combined, userInput);

  // 5. Trailing Prompts entfernen
  combined = stripTrailingPrompt(combined);

  return combined.trim();
}

/**
 * Prüft, ob ein Text ein Prompt-Signal enthält, das das Ende einer Antwort signalisiert.
 */
export function containsCompletionPrompt(text: string): boolean {
  return /(?:\n\r?|\r)(?:>|❯|\?|antigravity>|codex>|claude>|gemini>|freebuff>|\$)\s*$/i.test(text);
}

export interface ConversationBinding {
  conversationId: string;
  runtimeAgentId: string;
  userId?: string;
  generation: number;
}

interface OutputBuffer {
  conversationId: string;
  runtimeAgentId: string;
  generation: number;
  chunks: string[];
  lastInput?: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastSavedHash?: string;
}

export class PtyOutputBridge {
  private bindings = new Map<string, ConversationBinding>(); // runtimeAgentId -> binding
  private buffers = new Map<string, OutputBuffer>(); // runtimeAgentId -> buffer
  private subscriptions = new Map<string, () => void>();

  constructor(
    private store: UnifiedSessionStore = defaultSessionStore,
    private idleDelayMs: number = 1500,
  ) {}

  /**
   * Bindet einen runtimeAgentId an eine conversationId (aus authentifiziertem Channel-Context).
   */
  bindConversation(binding: {
    conversationId: string;
    runtimeAgentId: string;
    userId?: string;
    generation?: number;
  }): void {
    const gen = binding.generation ?? 0;
    const existing = this.bindings.get(binding.runtimeAgentId);

    // Falls sich Generation oder conversationId geändert hat, vorherigen Puffer verwerfen
    if (existing && (existing.generation !== gen || existing.conversationId !== binding.conversationId)) {
      this.clearBuffer(binding.runtimeAgentId);
    }

    this.bindings.set(binding.runtimeAgentId, {
      conversationId: binding.conversationId,
      runtimeAgentId: binding.runtimeAgentId,
      userId: binding.userId,
      generation: gen,
    });
  }

  /**
   * Registriert die Benutzereingabe, damit Echo-Reste herausgefiltert werden können.
   */
  recordUserInput(runtimeAgentId: string, input: string): void {
    const buffer = this.buffers.get(runtimeAgentId);
    if (buffer) {
      buffer.lastInput = input;
    } else {
      const binding = this.bindings.get(runtimeAgentId);
      if (binding) {
        this.buffers.set(runtimeAgentId, {
          conversationId: binding.conversationId,
          runtimeAgentId,
          generation: binding.generation,
          chunks: [],
          lastInput: input,
          idleTimer: null,
        });
      }
    }
  }

  /**
   * Verarbeitet einen eingehenden PTY-Chunk für einen Agenten.
   */
  onChunk(runtimeAgentId: string, chunk: string, generation?: number): void {
    const binding = this.bindings.get(runtimeAgentId);
    if (!binding) return; // Nicht gebundener Agent -> keine Chat-Zuordnung

    // Generationen-Schutz: Ausgaben früherer Generationen ignorieren
    if (generation !== undefined && generation !== binding.generation) {
      return;
    }

    let buffer = this.buffers.get(runtimeAgentId);
    if (!buffer || buffer.generation !== binding.generation || buffer.conversationId !== binding.conversationId) {
      if (buffer?.idleTimer) clearTimeout(buffer.idleTimer);
      buffer = {
        conversationId: binding.conversationId,
        runtimeAgentId,
        generation: binding.generation,
        chunks: [],
        lastInput: undefined,
        idleTimer: null,
      };
      this.buffers.set(runtimeAgentId, buffer);
    }

    buffer.chunks.push(chunk);

    // Vorherigen Idle-Timer zurücksetzen
    if (buffer.idleTimer) {
      clearTimeout(buffer.idleTimer);
      buffer.idleTimer = null;
    }

    // Wenn ein Abschluss-Signal (Prompt-Ende) erkannt wurde, schneller flushen (200ms)
    const recentTail = buffer.chunks.slice(-3).join("");
    const isCompleted = containsCompletionPrompt(recentTail);
    const delay = isCompleted ? 250 : this.idleDelayMs;

    buffer.idleTimer = setTimeout(() => {
      void this.flush(runtimeAgentId);
    }, delay);
  }

  /**
   * Schließt die aktuelle Pufferung ab und speichert die bereinigte Nachricht in conversation_messages.
   */
  async flush(runtimeAgentId: string): Promise<UnifiedMessage | null> {
    const buffer = this.buffers.get(runtimeAgentId);
    if (!buffer) return null;

    if (buffer.idleTimer) {
      clearTimeout(buffer.idleTimer);
      buffer.idleTimer = null;
    }

    const raw = buffer.chunks.join("");
    buffer.chunks = []; // Puffer leeren

    if (!raw.trim()) return null;

    const cleaned = cleanTerminalOutput(raw, buffer.lastInput);
    if (!cleaned || cleaned.length < 2) return null;

    // Idempotenz-Schutz: Gleicher Inhalt in dieser Generation nicht erneut speichern
    const contentHash = `${cleaned.length}:${cleaned.slice(0, 50)}:${cleaned.slice(-50)}`;
    if (buffer.lastSavedHash === contentHash) {
      return null;
    }
    buffer.lastSavedHash = contentHash;

    try {
      const message = await this.store.addMessage({
        conversationId: buffer.conversationId,
        role: "assistant",
        source: "cli",
        content: cleaned,
      });
      return message;
    } catch (err) {
      console.warn(`[pty-output-bridge] Fehler beim Speichern der CLI-Antwort für ${runtimeAgentId}:`, err);
      return null;
    }
  }

  /**
   * Löscht den Puffer und bricht laufende Timer für einen Agenten ab.
   */
  clearBuffer(runtimeAgentId: string): void {
    const buffer = this.buffers.get(runtimeAgentId);
    if (buffer?.idleTimer) {
      clearTimeout(buffer.idleTimer);
    }
    this.buffers.delete(runtimeAgentId);
  }

  /**
   * Entfernt Bindung und Puffer (z.B. beim Verlassen des Channels).
   */
  unbind(runtimeAgentId: string): void {
    this.clearBuffer(runtimeAgentId);
    this.bindings.delete(runtimeAgentId);
    const unsub = this.subscriptions.get(runtimeAgentId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(runtimeAgentId);
    }
  }

  /**
   * Verbindet die Bridge mit dem Terminal-Manager.
   */
  attachTerminalManager(manager: {
    subscribeAgentTerminal: (agentId: string, cb: (chunk: string, meta?: any) => void) => () => void;
    getAgentTerminalStatus?: (agentId: string) => { generation?: number };
  }): void {
    // Dynamische Subscription bei jeder bindConversation Anfrage oder zentral
  }

  getBinding(runtimeAgentId: string): ConversationBinding | undefined {
    return this.bindings.get(runtimeAgentId);
  }

  getBufferCount(): number {
    return this.buffers.size;
  }
}

export const defaultPtyOutputBridge = new PtyOutputBridge();
