import { Hono } from "hono";
import {
  type CircleAnalyzeRequest,
  type CircleAnalyzeResponse,
  CircleAnalyzeRequestSchema,
  type DesktopAction,
} from "../../../../packages/shared/src/desktop/contracts";

const OLLAMA_HOST = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "qwen2.5-vl";
const OLLAMA_TIMEOUT_MS = 3500;

/**
 * Analyzes an encircled screenshot and accompanying prompt / UIA elements.
 * Tries local vision model (Ollama) first; falls back smoothly to heuristic reasoning engine.
 */
export async function analyzeCircle(
  request: CircleAnalyzeRequest
): Promise<CircleAnalyzeResponse> {
  const prompt = (request.textPrompt || "").trim();
  const windowTitle = (request.windowTitle || "").trim();
  const uiaElements = request.uiaElements || [];

  // 1. Try Ollama Vision if base64 image is provided and prompt exists
  if (request.imageBase64 && prompt.length > 0) {
    try {
      const ollamaResult = await queryOllamaVision(
        request.imageBase64,
        prompt,
        windowTitle,
        uiaElements
      );
      if (ollamaResult && ollamaResult.confidence >= 0.6) {
        return ollamaResult;
      }
    } catch {
      // Graceful fallback to heuristic engine
    }
  }

  // 2. Local Heuristic Reasoning Engine
  return applyHeuristicCircleEngine(prompt, windowTitle, uiaElements);
}

/**
 * Queries Ollama Vision endpoint with strict timeout and JSON output format.
 */
async function queryOllamaVision(
  imageBase64: string,
  prompt: string,
  windowTitle: string,
  uiaElements: Array<Record<string, unknown>>
): Promise<CircleAnalyzeResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const uiaSummary = uiaElements
      .slice(0, 10)
      .map((el) => {
        const name = el.name ? `"${el.name}"` : "";
        const role = el.role ? `[${el.role}]` : "";
        const text = el.fuzzyText ? `(${el.fuzzyText})` : "";
        return `${role} ${name} ${text}`.trim();
      })
      .filter((s) => s.length > 0)
      .join("; ");

    const systemPrompt = `You are Connect Desktop Vision Assistant.
The user encircled a region on their Windows screen and asked a question or gave a command.
Active Window: "${windowTitle}".
Detected UI elements: ${uiaSummary || "none"}.

Respond ONLY with valid JSON in this exact structure:
{
  "intent": string,
  "interpretation": string,
  "plan": [
    {
      "type": "open_url" | "click" | "open_app" | "type_text" | "key_combo",
      "risk": "act" | "read",
      "targetDescription": string,
      "openUrl": { "url": string, "preferHelium": true },
      "click": { "button": "left", "clickType": "single" }
    }
  ],
  "confidence": number between 0.0 and 1.0
}`;

    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `User prompt: "${prompt}"`,
            images: [cleanBase64],
          },
        ],
        format: "json",
        stream: false,
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as CircleAnalyzeResponse;
    if (parsed.intent && parsed.interpretation && Array.isArray(parsed.plan)) {
      return {
        intent: parsed.intent,
        interpretation: parsed.interpretation,
        plan: parsed.plan,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Heuristic reasoning engine:
 * Evaluates user prompt, window title, and UIA tree to derive intent and actionable plans.
 */
export function applyHeuristicCircleEngine(
  prompt: string,
  windowTitle: string,
  uiaElements: Array<Record<string, unknown>>
): CircleAnalyzeResponse {
  const lowerPrompt = prompt.toLowerCase().trim();
  const lowerTitle = windowTitle.toLowerCase();

  // Combine element texts for context matching
  const elementTexts = uiaElements
    .map((e) => `${e.name || ""} ${e.fuzzyText || ""} ${e.className || ""}`)
    .join(" ")
    .toLowerCase();

  // Case 1: Steam Store / Store page opening
  // e.g., "öffne die Store-Seite", "Store-Seite öffnen", "open store page", "im store ansehen"
  const isStoreRequest =
    lowerPrompt.includes("store-seite") ||
    lowerPrompt.includes("store seite") ||
    lowerPrompt.includes("store") ||
    lowerPrompt.includes("shop") ||
    lowerPrompt.includes("kaufseite");

  const isSteamContext =
    lowerTitle.includes("steam") ||
    lowerPrompt.includes("steam") ||
    elementTexts.includes("steam") ||
    lowerTitle.includes("valve");

  if (isStoreRequest || (isSteamContext && lowerPrompt.includes("öffne"))) {
    // Try to extract game name or app id
    let gameTitle = extractGameTitle(windowTitle, uiaElements, prompt);
    let targetUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(gameTitle || "game")}`;

    // Check if an app ID is explicitly visible in UIA or title
    const appIdMatch = (windowTitle + " " + elementTexts).match(/\bapp[\/:](\d{3,8})\b/i);
    if (appIdMatch && appIdMatch[1]) {
      targetUrl = `https://store.steampowered.com/app/${appIdMatch[1]}/`;
    }

    const action: DesktopAction = {
      type: "open_url",
      risk: "act",
      targetDescription: `Steam Store-Seite für ${gameTitle || "Spiel"}`,
      openUrl: {
        url: targetUrl,
        preferHelium: true,
        newWindow: false,
      },
    };

    return {
      intent: "open_store_page",
      interpretation: `Öffne die Steam-Store-Seite für "${gameTitle || "das ausgewählte Spiel"}".`,
      plan: [action],
      confidence: 0.96,
    };
  }

  // Case 2: General Questions (Was ist das, Wer ist das, Wie viel kostet..., etc.)
  const isQuestion =
    lowerPrompt.endsWith("?") ||
    /^(was|wer|wo|wie|wann|warum|welche|welcher|welches|gibt es|kannst du|erkläre|what|who|where|how|why|is this|explain)\b/i.test(
      lowerPrompt
    );

  if (isQuestion) {
    // Extract key labels from UIA elements
    const elementHighlights = uiaElements
      .map((e) => (typeof e.name === "string" ? e.name.trim() : ""))
      .filter((n) => n.length > 1)
      .slice(0, 5);

    let answer = "";
    if (elementHighlights.length > 0) {
      answer = `Im markierten Bereich befinden sich: ${elementHighlights.join(", ")}.`;
      if (windowTitle) {
        answer += ` (Fenster: ${windowTitle})`;
      }
    } else if (windowTitle) {
      answer = `Ausgewählter Bildbereich im Fenster "${windowTitle}".`;
    } else {
      answer = `Bildbereich erfasst für die Frage: "${prompt}".`;
    }

    return {
      intent: "answer",
      interpretation: answer,
      plan: [], // Informational answer - no action required
      confidence: 0.92,
    };
  }

  // Case 3: Direct Click request ("klick auf...", "drücke...", "click...")
  if (
    lowerPrompt.startsWith("klick") ||
    lowerPrompt.startsWith("drück") ||
    lowerPrompt.startsWith("wähl") ||
    lowerPrompt.startsWith("click")
  ) {
    const targetQuery = lowerPrompt
      .replace(/^(klick(e)?\s+(auf\s+|den\s+|das\s+|die\s+)?|drück(e)?\s+|click\s+(on\s+)?)/i, "")
      .trim();

    // Match best UIA element
    const matchedElement = uiaElements.find((e) => {
      const name = typeof e.name === "string" ? e.name.toLowerCase() : "";
      return name.includes(targetQuery) || targetQuery.includes(name);
    });

    const targetDesc = matchedElement && typeof matchedElement.name === "string"
      ? matchedElement.name
      : targetQuery || "Element";

    const action: DesktopAction = {
      type: "click",
      risk: "act",
      targetDescription: `Klicke auf ${targetDesc}`,
      click: {
        button: "left",
        clickType: "single",
        selector: {
          name: targetDesc,
          role: (matchedElement?.role as string) || "Button",
          index: 0,
        },
      },
    };

    return {
      intent: "click_element",
      interpretation: `Klicke auf das Element "${targetDesc}".`,
      plan: [action],
      confidence: 0.88,
    };
  }

  // Case 4: Open URL or Web Search
  if (lowerPrompt.includes("öffne youtube") || lowerPrompt.includes("play youtube")) {
    return {
      intent: "open_url",
      interpretation: "Öffne YouTube im Helium-Browser.",
      plan: [
        {
          type: "open_url",
          risk: "act",
          targetDescription: "YouTube Startseite",
          openUrl: {
            url: "https://www.youtube.com",
            preferHelium: true,
            newWindow: false,
          },
        },
      ],
      confidence: 0.95,
    };
  }

  // Case 5: Default fallback
  return {
    intent: "inspect_region",
    interpretation: `Region analysiert für "${prompt || "keine Angabe"}".`,
    plan: [],
    confidence: 0.75,
  };
}

/**
 * Extracts game title from window title or UIA elements.
 */
function extractGameTitle(
  windowTitle: string,
  uiaElements: Array<Record<string, unknown>>,
  prompt: string
): string {
  // 1. Try from prompt if user says e.g. "öffne die Store-Seite von Cyberpunk"
  const promptMatch = prompt.match(/(?:von|für|for|of)\s+([A-Za-z0-9\s:_-]+)/i);
  if (promptMatch && promptMatch[1]) {
    const candidate = promptMatch[1].replace(/Store-Seite|Store/i, "").trim();
    if (candidate.length > 1) return candidate;
  }

  // 2. Check window title (e.g. "Counter-Strike 2 - Steam", "Hades", "Cyberpunk 2077")
  if (windowTitle) {
    const cleaned = windowTitle
      .replace(/\s*-\s*Steam\s*$/i, "")
      .replace(/\s*-\s*Helium.*$/i, "")
      .replace(/^Steam\s*-\s*/i, "")
      .trim();
    if (cleaned.length > 1 && !cleaned.toLowerCase().includes("community")) {
      return cleaned;
    }
  }

  // 3. Search UIA elements for headers, titles, or dominant text
  for (const el of uiaElements) {
    const name = typeof el.name === "string" ? el.name.trim() : "";
    if (name.length > 2 && name.length < 50) {
      if (
        !name.toLowerCase().includes("store") &&
        !name.toLowerCase().includes("bibliothek") &&
        !name.toLowerCase().includes("community") &&
        !name.toLowerCase().includes("steam")
      ) {
        return name;
      }
    }
  }

  return "Steam";
}

/**
 * Hono Router for Circle API endpoints.
 */
export function createCircleRouter(): Hono {
  const router = new Hono();

  const handler = async (c: any) => {
    try {
      const body = await c.req.json();
      const parsed = CircleAnalyzeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "Invalid request payload",
            details: parsed.error.format(),
          },
          400
        );
      }

      const result = await analyzeCircle(parsed.data);
      return c.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Circle analysis failed", message: msg }, 500);
    }
  };

  router.post("/", handler);
  router.post("/circle", handler);

  return router;
}
