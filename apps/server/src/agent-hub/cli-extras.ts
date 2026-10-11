/**
 * Status-Stubs für weitere unsichtbare Anbieter-CLIs (Google/Veo, freebuff).
 * Volle Adapter später; hier nur Install-/Login-Hinweise für Einstellungen › Anbieter.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function npmGlobalRoots(): string[] {
  const roots: string[] = [];
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, "npm", "node_modules"));
  if (process.env.npm_config_prefix) roots.push(join(process.env.npm_config_prefix, "node_modules"));
  roots.push(join(homedir(), ".npm-global", "lib", "node_modules"), "/usr/local/lib/node_modules");
  return roots;
}

function pkgMeta(pkg: string): { installed: boolean; version: string | null; entry: string | null } {
  for (const root of npmGlobalRoots()) {
    const dir = join(root, ...pkg.split("/"));
    const pkgJson = join(dir, "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const version = (JSON.parse(readFileSync(pkgJson, "utf8")) as { version?: string }).version ?? null;
      return { installed: true, version, entry: dir };
    } catch {
      return { installed: true, version: null, entry: dir };
    }
  }
  return { installed: false, version: null, entry: null };
}

export type ExtraCliStatus = {
  kind: "google-gemini" | "google-veo" | "freebuff";
  label: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  detail: string;
  models: string[];
  installHint: string;
};

export async function extraCliProviderStatus(): Promise<ExtraCliStatus[]> {
  const gemini = pkgMeta("@google/gemini-cli");
  const veo = pkgMeta("google-genai-api");
  const freebuff = pkgMeta("freebuff");
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENAI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());

  return [
    {
      kind: "google-gemini",
      label: "Google Gemini CLI",
      installed: gemini.installed,
      version: gemini.version,
      loggedIn: gemini.installed ? (hasGeminiKey ? true : null) : null,
      detail: gemini.installed
        ? hasGeminiKey
          ? "Installiert; API-Key in der Umgebung erkannt."
          : "Installiert. Einmal interaktiv anmelden: gemini (OAuth) — oder GEMINI_API_KEY / GOOGLE_GENAI_API_KEY setzen."
        : "Nicht installiert.",
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      installHint: "npm install -g @google/gemini-cli",
    },
    {
      kind: "google-veo",
      label: "Google Veo (Video aus Code)",
      installed: veo.installed,
      version: veo.version,
      loggedIn: veo.installed ? (hasGeminiKey ? true : false) : null,
      detail: veo.installed
        ? hasGeminiKey
          ? "Installiert. Video: google-genai --veo --prompt \"…\" --veo-duration 8"
          : "Installiert, braucht GOOGLE_GENAI_API_KEY (Gemini API). Befehl: google-genai --veo --prompt \"…\""
        : "Nicht installiert. Primär für Video-Generierung (Veo 3.1).",
      models: ["veo-3.1-generate-preview", "veo-3.1-lite-generate-preview"],
      installHint: "npm install -g google-genai-api",
    },
    {
      kind: "freebuff",
      label: "freebuff (Coding + Browser)",
      installed: freebuff.installed,
      version: freebuff.version,
      loggedIn: freebuff.installed ? null : null,
      detail: freebuff.installed
        ? "Installiert. Einmal: freebuff login. Browser-Use ist eingebaut. Hinweis: ToS von freebuff selbst prüfen (Stefan: explizit für Browser-Steuerung gewünscht)."
        : "Nicht installiert. Coding-Agent mit eingebautem Browser-Use.",
      models: ["default"],
      installHint: "npm install -g freebuff",
    },
  ];
}