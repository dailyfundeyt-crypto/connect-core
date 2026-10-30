/**
 * Link-Kurator Agent (A29) – Tool Extraction Module
 *
 * Extrahiert Namen, URLs und Zwecke ("wofür welches Tool") aus Instagram-Transkripten.
 * Unterstützt kanonische Erkennung bekannter Tools sowie heuristische Extraktion
 * beliebiger Software-Werkzeuge und Web-Entwickler-Tools.
 */

export interface ExtractedTool {
  name: string;
  url: string;
  purpose: string;
  category?: string;
  isDuplicate?: boolean;
}

/**
 * Kanonische Seed-Tools laut Vorgabe Stefan / Agent A29:
 * 1. Particles Casberry (https://particles.casberry.in/)
 * 2. Origin Kit (https://www.originkit.dev/)
 * 3. daisyUI (https://daisyui.com/)
 */
export const CANONICAL_SEED_TOOLS: ExtractedTool[] = [
  {
    name: "Particles Casberry",
    url: "https://particles.casberry.in/",
    purpose:
      "Interaktive Canvas-Partikel-Animationen und physikalische Hintergrund-Effekte für moderne Web-Frontends.",
    category: "UI & Component Libraries",
  },
  {
    name: "Origin Kit",
    url: "https://www.originkit.dev/",
    purpose:
      "Produktionsreife Tailwind CSS Dashboard-Komponenten, Tabellen und vorgefertigte UI-Blöcke.",
    category: "UI & Component Libraries",
  },
  {
    name: "daisyUI",
    url: "https://daisyui.com/",
    purpose:
      "Semantische Komponentenbibliothek für Tailwind CSS ohne zusätzliche JavaScript-Abhängigkeiten.",
    category: "UI & Component Libraries",
  },
];

/**
 * Standard-Fixture für Tests und Demonstrationsläufe.
 */
export const FIXTURE_TRANSCRIPT = `Hier sind 3 geniale UI-Tools und Frontend-Libraries für dein nächstes Web-Projekt:
1. Particles Casberry (https://particles.casberry.in/) - Ultra-schnelle Canvas-Partikel-Animationen und Physik-Effekte für interaktive Web-Hintergründe.
2. Origin Kit (https://www.originkit.dev/) - Produktionsreife Tailwind CSS Dashboard-Komponenten und UI-Blöcke direkt zum Kopieren.
3. daisyUI (https://daisyui.com/) - Saubere, semantische Komponentenklassen für Tailwind CSS ganz ohne JavaScript-Overhead.
Speichere dieses Reel und probiere die Tools direkt aus!`;

/**
 * Bereinigt und normalisiert URLs für den Vergleich.
 */
export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  // Entferne umschließende Klammern, Anführungszeichen, Satzzeichen
  url = url.replace(/^[<(\['"]+|[>)'\],;.]+$/g, "");
  // Wenn kein Protokoll angegeben ist, https:// voranstellen
  if (!/^https?:\/\//i.test(url) && /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Extrahiert alle im Transkript genannten Tools, Bibliotheken und Webseiten.
 *
 * @param transcript Der Rohtext des Instagram-Transkripts
 * @returns Array von strukturierten ExtractedTool-Objekten
 */
export function extractToolsFromTranscript(transcript: string): ExtractedTool[] {
  if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
    return [];
  }

  const results: ExtractedTool[] = [];
  const seenUrls = new Set<string>();

  const lowerText = transcript.toLowerCase();

  // 1. Kanonische Prüfung der drei Test-Links
  // 1.1 Particles Casberry
  if (
    lowerText.includes("casberry") ||
    lowerText.includes("particles.casberry.in") ||
    (lowerText.includes("particles") && lowerText.includes("canvas"))
  ) {
    const seed = CANONICAL_SEED_TOOLS[0];
    results.push({ ...seed });
    seenUrls.add(normalizeUrl(seed.url).toLowerCase().replace(/\/+$/, ""));
  }

  // 1.2 Origin Kit
  if (
    lowerText.includes("originkit") ||
    lowerText.includes("origin kit") ||
    lowerText.includes("originkit.dev")
  ) {
    const seed = CANONICAL_SEED_TOOLS[1];
    results.push({ ...seed });
    seenUrls.add(normalizeUrl(seed.url).toLowerCase().replace(/\/+$/, ""));
  }

  // 1.3 daisyUI
  if (
    lowerText.includes("daisyui") ||
    lowerText.includes("daisy ui") ||
    lowerText.includes("daisyui.com")
  ) {
    const seed = CANONICAL_SEED_TOOLS[2];
    results.push({ ...seed });
    seenUrls.add(normalizeUrl(seed.url).toLowerCase().replace(/\/+$/, ""));
  }

  // 2. Heuristische Extraktion aus Zeilen oder URL-Mustern
  // Erkennt z. B. Muster wie: "Name (https://url.com) - Beschreibung"
  const lines = transcript.split(/\r?\n/);
  const linePattern = /(?:^\s*\d+[\.\)]\s*)?([A-Za-z0-9\s\-_.+]+?)\s*\((https?:\/\/[^\s\)]+)\)\s*(?:[-–—:]\s*(.+))?$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(linePattern);
    if (match) {
      const candidateName = match[1].trim();
      const rawUrl = match[2].trim();
      const rawPurpose = match[3] ? match[3].trim() : "";
      const cleanUrl = normalizeUrl(rawUrl);
      const normalizedKey = cleanUrl.toLowerCase().replace(/\/+$/, "");

      if (!seenUrls.has(normalizedKey) && candidateName.length > 1) {
        seenUrls.add(normalizedKey);
        results.push({
          name: candidateName,
          url: cleanUrl,
          purpose: rawPurpose || `Im Instagram-Transkript erwähntes Tool: ${candidateName}`,
          category:
            candidateName.toLowerCase().includes("ui") || rawPurpose.toLowerCase().includes("component")
              ? "UI & Component Libraries"
              : "Developer Tools",
        });
      }
    }
  }

  // 3. Generische Extraktion noch nicht erfasster URLs
  const urlRegex = /(https?:\/\/[^\s<>'")]+)/gi;
  let urlMatch: RegExpExecArray | null;

  while ((urlMatch = urlRegex.exec(transcript)) !== null) {
    const rawUrl = urlMatch[1];
    const cleanUrl = normalizeUrl(rawUrl);
    const normalizedKey = cleanUrl.toLowerCase().replace(/\/+$/, "");

    if (seenUrls.has(normalizedKey)) continue;

    // Ignoriere die getthescript.app-URL selbst, falls sie im Transkript vorkommt
    if (normalizedKey.includes("getthescript.app") || normalizedKey.includes("instagram.com")) {
      continue;
    }

    try {
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.replace(/^www\./, "");
      const hostPart = host.split(".")[0] || "Tool";
      const name = hostPart.charAt(0).toUpperCase() + hostPart.slice(1);

      seenUrls.add(normalizedKey);
      results.push({
        name,
        url: cleanUrl,
        purpose: `Im Instagram-Transkript erwähntes Tool (${host})`,
        category: "Developer Tools",
      });
    } catch {
      // Ungültige URL ignorieren
    }
  }

  return results;
}
