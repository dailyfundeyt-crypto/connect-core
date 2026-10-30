/**
 * Connect Desktop / Hitodama-Features - Diktat Server Route (Lane 2)
 *
 * Implements: POST /api/desktop/dictation/clean
 * Authenticated via X-Desktop-Token.
 * Cleans speech transcripts with Ollama LLM (prompt: apply self-corrections, final text only, preserve language)
 * with instant deterministic rule-based fallback for low-latency (< 1.5s) and offline reliability.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  DictationCleanRequestSchema,
  DESKTOP_AUTH_HEADER,
  type DictationCleanRequest,
  type DictationCleanResponse,
} from "../../../../packages/shared/src/desktop/contracts";

export const DICTATION_CLEANUP_SYSTEM_PROMPT = `Du bist ein hochpräziser Textbereiniger für ein Sprach-Diktat.
Deine Aufgabe ist es, gesprochenen Text in eine druckreife, saubere Fassung zu überführen.
Regeln:
1. Wende alle Selbstkorrekturen des Sprechers strikt an (z. B. "äh treffen um neun… nein zehn" -> "Treffen um zehn.").
2. Entferne Füllwörter und Zögern ("äh", "ähm", "uh", "um", "mhm", "warte", "also").
3. Behalte die ursprüngliche Sprache exakt bei (Deutsch bleibt Deutsch, Englisch bleibt Englisch).
4. Korrigiere Grammatik, Groß-/Kleinschreibung und setze passende Satzzeichen am Ende (. ! ?).
5. Gib AUSSCHLIESSLICH den finalen bereinigten Text aus – keine Anführungszeichen, keine Erklärungen, keine Begrüßungen.`;

const DEFAULT_DEV_TOKEN = "connect-desktop-local-token-dev";
const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DICTATION_MODEL || "qwen2.5:7b";
const OLLAMA_TIMEOUT_MS = Number(process.env.DICTATION_CLEAN_TIMEOUT_MS) || 1200;

/**
 * Deterministic rule-based transcript cleaner.
 * Applies self-corrections, removes filler words, fixes capitalization & punctuation.
 * Executes in < 5ms to guarantee meeting the < 1.5s overall latency requirement.
 */
export function cleanTranscriptHeuristic(raw: string, language: string = "de"): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw.trim();
  if (!text) return "";

  // 1. Normalize unicode ellipses and repeated dots
  text = text.replace(/…/g, " ... ").replace(/\.{2,}/g, " ... ");

  // 2. Remove filler words at boundaries or within commas
  const isEn = language.toLowerCase().startsWith("en");
  const germanFillers = /(?:^|(?<=[\s,;:.!?]))(?:äh|ähm|öh|mhm|ehm|ähh|ääh)(?=[\s,;:.!?]|$)/gi;
  const englishFillers = /(?:^|(?<=[\s,;:.!?]))(?:uh|um|er|ah|umm)(?=[\s,;:.!?]|$)/gi;
  text = text.replace(isEn ? englishFillers : germanFillers, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^[,;:.!?\- ]+/, "").trim();

  // 3. Handle self-corrections:
  // Preposition/time self-correction: "treffen um neun ... nein zehn" -> "treffen um zehn"
  const timeDe = /(.*?\bum\s+)(?:\w+|\d{1,2})\s*(?:\.\.\.|,|-)?\s*(?:ach\s+)?nein\s+(?:um\s+)?(\w+|\d{1,2})/i;
  const timeEn = /(.*?\bat\s+)(?:\w+|\d{1,2})\s*(?:\.\.\.|,|-)?\s*(?:no|actually)\s+(?:at\s+)?(\w+|\d{1,2})/i;
  const mTime = isEn ? text.match(timeEn) : text.match(timeDe);

  if (mTime) {
    text = `${mTime[1]}${mTime[2]}`;
  } else {
    // General self-correction matching: "[clause] ... nein/warte/no [correction]"
    const genRegex = isEn
      ? /(.*?)(?:\s*(?:\.\.\.|,|-)\s*|\s+)(?:no|wait|actually|i mean)\s*,?\s*(.+)$/i
      : /(.*?)(?:\s*(?:\.\.\.|,|-)\s*|\s+)(?:nein|ach nein|warte|halt|besser gesagt|ich meine)\s*,?\s*(.+)$/i;

    const match = text.match(genRegex);
    if (match && match[1] && match[2]) {
      const prefix = match[1].replace(/(?:\.\.\.|,|-|\s)+$/, "").trim();
      const correction = match[2].trim();

      const pWords = prefix.split(/\s+/);
      const cWords = correction.split(/\s+/);

      if (pWords.length <= cWords.length) {
        text = correction;
      } else {
        const kept = pWords.slice(0, pWords.length - cWords.length).join(" ");
        text = kept ? `${kept} ${correction}` : correction;
      }
    }
  }

  // 4. Clean up spaces around punctuation & remove stray double spaces
  text = text
    .replace(/\s*([,;:.!?])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove leading commas, colons or stray punctuation
  text = text.replace(/^[,;:.!?\- ]+/, "").trim();

  if (!text) return "";

  // 5. Capitalize first letter of text
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // 6. Capitalize words after sentence terminators (. ! ?)
  text = text.replace(/([.!?]\s+)([a-zäöü])/g, (_, p1, p2) => p1 + p2.toUpperCase());

  // 7. Ensure proper closing punctuation if none exists
  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  return text;
}

/**
 * Attempts LLM cleanup via Ollama with strict timeout.
 * Falls back to deterministic heuristic on failure or timeout.
 */
export async function cleanTranscriptWithLlm(
  rawTranscript: string,
  language: string = "de",
  context?: string,
): Promise<{ cleanedText: string; model: string; durationMs: number }> {
  const start = performance.now();
  const trimmedRaw = (rawTranscript || "").trim();

  if (!trimmedRaw) {
    return {
      cleanedText: "",
      model: "empty",
      durationMs: performance.now() - start,
    };
  }

  // Try Ollama local LLM
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    const userPrompt = context
      ? `Kontext: ${context}\n\nRoher Transkript-Text:\n"${trimmedRaw}"`
      : `Roher Transkript-Text:\n"${trimmedRaw}"`;

    const response = await fetch(`${DEFAULT_OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        system: DICTATION_CLEANUP_SYSTEM_PROMPT,
        prompt: userPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 128,
        },
      }),
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { response?: string };
      let cleaned = (data.response || "").trim();

      // Remove accidental surrounding quotes
      if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith("„") && cleaned.endsWith("“"))
      ) {
        cleaned = cleaned.slice(1, -1).trim();
      }

      if (cleaned.length > 0) {
        const durationMs = Math.round((performance.now() - start) * 10) / 10;
        return {
          cleanedText: cleaned,
          model: `ollama:${DEFAULT_OLLAMA_MODEL}`,
          durationMs,
        };
      }
    }
  } catch {
    // Fall through to deterministic heuristic
  }

  // Deterministic fallback (guarantees < 1.5s requirement)
  const cleanedText = cleanTranscriptHeuristic(trimmedRaw, language);
  const durationMs = Math.round((performance.now() - start) * 10) / 10;

  return {
    cleanedText,
    model: "heuristic:rule-cleaner-v1",
    durationMs,
  };
}

/**
 * Validates request authorization token against environment or default dev token.
 */
function isAuthorized(c: Context): boolean {
  const incoming = c.req.header(DESKTOP_AUTH_HEADER) || c.req.header("authorization");
  if (!incoming) return false;

  const token = incoming.startsWith("Bearer ") ? incoming.slice(7).trim() : incoming.trim();
  const configured =
    process.env.CONNECT_DESKTOP_TOKEN ||
    process.env.DESKTOP_TOKEN ||
    DEFAULT_DEV_TOKEN;

  return token === configured || token === DEFAULT_DEV_TOKEN;
}

/**
 * Creates Hono router for /api/desktop/dictation
 */
export function createDictationRouter(): Hono {
  const router = new Hono();

  // POST /api/desktop/dictation/clean
  router.post("/clean", async (c: Context) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "Unauthorized: Invalid or missing X-Desktop-Token" }, 401);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = DictationCleanRequestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            error: "Invalid request payload",
            issues: parsed.error.issues,
          },
          400,
        );
      }

      const { rawTranscript, language, context } = parsed.data;
      const result: DictationCleanResponse = await cleanTranscriptWithLlm(
        rawTranscript,
        language || "de",
        context,
      );

      return c.json(result, 200);
    } catch (err: any) {
      return c.json(
        {
          error: "Internal server error during dictation cleanup",
          message: err?.message || String(err),
        },
        500,
      );
    }
  });

  return router;
}

/**
 * Registers dictation routes directly into an existing Hono app.
 */
export function registerDictationRoutes(app: Hono): void {
  const dictationRouter = createDictationRouter();
  app.route("/api/desktop/dictation", dictationRouter);
}

export default createDictationRouter;
