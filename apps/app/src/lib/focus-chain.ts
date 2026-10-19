/**
 * Fokus-Kette (helium-focuschain2): Big-Boss-Startseite + 5 Plan-Apps in fester,
 * bearbeitbarer Reihenfolge. Gespeichert in localStorage `connect.focus.chain`
 * und per Workspace-Sync (Postgres/Supabase) zwischen Geräten abgeglichen.
 */
import { scheduleConnectWorkspacePush } from "@/lib/companies/workspace-sync";
import { hasConnectShell, openInHeliumTab } from "@/lib/ui/open-window";

export const FOCUS_CHAIN_KEY = "connect.focus.chain";
export const FOCUS_CHAIN_STATE_KEY = "connect.focus.chain.state";
const BACKUP_KEY = "connect.focus.chain.bak-helium-focuschain2";
export const FOCUS_CHAIN_EVENT = "connect-focus-chain-changed";

export type FocusChainStep = {
  id: string;
  name: string;
  task: string;
  url: string;
  /** Android-App-Paket für intent:// (leer = normale URL). */
  android?: string;
  /** iOS-App-Schema, z.B. googlegmail:// (leer = normale URL). */
  ios?: string;
  /** "app" (Standard) = native App per Intent; "browser" = Webseite. */
  openMode?: "app" | "browser";
  /**
   * Android-Intent-Art: "launcher" (App-Start, bewährt für Gmail/Kontakte/Perplexity) oder
   * "link" (Deep-Link mit Paket; Docs/Drive – deren Launcher-Intent landete bei Stefan im Browser).
   */
  intentStyle?: "launcher" | "link";
  enabled: boolean;
};

const DEFAULT_INTENT_STYLE: Record<string, "launcher" | "link"> = { plan: "link", datenbank: "link", aufgaben: "link" };

/**
 * Revision der Intent-Standards. Ältere gespeicherte Werte für Plan/Aufgabenzuweisung/Datenbank
 * (Launcher oder Browser) werden einmalig auf App + Deep-Link gehoben.
 */
const INTENT_REV = 5;
const FORCE_APP_LINK = ["plan", "aufgaben", "datenbank"];

export type FocusChainConfig = {
  version: 2;
  bossName: string;
  /** Bild-URL fürs Big-Boss-Logo; leer = Premium-Platzhalter. */
  bossLogo: string;
  /** Antippen des Logos öffnet diesen Bot. */
  bossLink: string;
  steps: FocusChainStep[];
  /** true = alte Agenten-Karten statt Kette (Schalter, nicht Standard). */
  agentCards: boolean;
  /** Google-Konto für Docs/Kontakte/Drive/Gmail (authuser=…); leer = Standardkonto des Browsers. */
  googleAccount: string;
  intentRev?: number;
};

export const DEFAULT_GOOGLE_ACCOUNT = "dailyfunde.yt@gmail.com";

export const DEFAULT_BOSS_LINK =
  "https://connect-kunc-preview.vercel.app/channel/channel_5ea69222-aece-4b33-8464-85fd467a2890";

export const DEFAULT_STEPS: FocusChainStep[] = [
  { id: "plan", name: "Plan", task: "Pläne in Docs schreiben (Plan-Modus)", url: "https://docs.google.com/document/u/0/?authuser=dailyfunde.yt@gmail.com", android: "com.google.android.apps.docs.editors.docs", intentStyle: "link", enabled: true },
  { id: "agenten", name: "Agenten", task: "Kontakte für die Agenten", url: "https://contacts.google.com/?authuser=dailyfunde.yt@gmail.com", android: "com.google.android.contacts", enabled: true },
  { id: "aufgaben", name: "Aufgabenzuweisung", task: "Perplexity gibt den anderen Agenten die Aufträge", url: "https://www.perplexity.ai/projects/ebfe6bd3-7161-40e9-bd6a-690845a7aa12", android: "ai.perplexity.app.android", intentStyle: "link", enabled: true },
  { id: "datenbank", name: "Datenbank", task: "Dateien in der Datenbank wählen", url: "https://drive.google.com/drive/my-drive?authuser=dailyfunde.yt@gmail.com&hl=de", android: "com.google.android.apps.docs", intentStyle: "link", enabled: true },
  { id: "email", name: "E-Mail", task: "E-Mail, um zu überprüfen, ob die Aufträge erfüllt sind", url: "https://mail.google.com/mail/?authuser=dailyfunde.yt@gmail.com", android: "com.google.android.gm", ios: "googlegmail://", enabled: true },
];

export function defaultFocusChain(): FocusChainConfig {
  return { version: 2, bossName: "Big Boss", bossLogo: "", bossLink: DEFAULT_BOSS_LINK, steps: DEFAULT_STEPS.map((s) => ({ ...s })), agentCards: false, googleAccount: DEFAULT_GOOGLE_ACCOUNT, intentRev: INTENT_REV };
}

/** Frühere Standard-URLs (u/0) → werden auf die neuen authuser-Standards gehoben. */
const OLD_DEFAULT_URLS = [
  "https://docs.google.com/document/u/0/",
  "https://docs.google.com/document/?authuser=dailyfunde.yt@gmail.com",
  "https://contacts.google.com/",
  "https://drive.google.com/drive/my-drive?hl=de",
  "https://mail.google.com/mail/u/0/#inbox",
];

/** Alte Ids (v1-Entwurf) → neue Ids. */
const ID_ALIASES: Record<string, string> = { docs: "plan", kontakte: "agenten", contacts: "agenten", perplexity: "aufgaben", drive: "datenbank", gmail: "email", mail: "email" };

/**
 * Migration: alles, was nicht Version 2 ist, wird auf die neue Reihenfolge gebracht.
 * Eigene Links/Namen bleiben erhalten (per Id), ein früherer Big-Boss-Schritt wird zum
 * bossLink. Der alte Wert bleibt unter BACKUP_KEY liegen (nichts gelöscht).
 */
export function normalizeFocusChain(raw: unknown): FocusChainConfig {
  const base = defaultFocusChain();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<FocusChainConfig> & { steps?: unknown };
  const steps = Array.isArray(r.steps) ? (r.steps as Partial<FocusChainStep>[]) : [];
  const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
  const out: FocusChainConfig = {
    version: 2,
    bossName: str(r.bossName, base.bossName) || base.bossName,
    bossLogo: str(r.bossLogo, ""),
    bossLink: str(r.bossLink, "") || base.bossLink,
    agentCards: r.agentCards === true,
    googleAccount: typeof r.googleAccount === "string" ? r.googleAccount : DEFAULT_GOOGLE_ACCOUNT,
    steps: [],
    intentRev: INTENT_REV,
  };
  const oldRev = typeof r.intentRev === "number" ? r.intentRev : 0;
  if (r.version === 2) {
    const seen = new Set<string>();
    for (const s of steps) {
      if (!s || typeof s.id !== "string" || seen.has(s.id)) continue;
      seen.add(s.id);
      const def = DEFAULT_STEPS.find((d) => d.id === s.id);
      out.steps.push({
        id: s.id,
        name: str(s.name, def?.name ?? s.id),
        task: str(s.task, def?.task ?? ""),
        url: OLD_DEFAULT_URLS.includes(str(s.url, "")) && def ? def.url : str(s.url, def?.url ?? ""),
        android: str(s.android, def?.android ?? ""),
        ios: str(s.ios, def?.ios ?? ""),
        openMode: s.openMode === "browser" && !(oldRev < INTENT_REV && FORCE_APP_LINK.includes(s.id)) ? "browser" : "app",
        intentStyle:
          oldRev < INTENT_REV && FORCE_APP_LINK.includes(s.id)
            ? "link"
            : s.intentStyle === "link" || s.intentStyle === "launcher"
              ? s.intentStyle
              : (DEFAULT_INTENT_STYLE[s.id] ?? "launcher"),
        enabled: s.enabled !== false,
      });
    }
    for (const d of DEFAULT_STEPS) if (!seen.has(d.id)) out.steps.push({ ...d });
    return out;
  }
  // v1 / unbekannt: neue Reihenfolge, eigene URLs übernehmen
  for (const s of steps) {
    if (!s || typeof s.id !== "string") continue;
    if (s.id === "bigboss" || s.id === "boss") {
      if (typeof s.url === "string" && s.url.trim()) out.bossLink = s.url.trim();
    }
  }
  out.steps = DEFAULT_STEPS.map((d) => {
    const old = steps.find((s) => s && typeof s.id === "string" && (ID_ALIASES[s.id] ?? s.id) === d.id);
    return { ...d, url: old && typeof old.url === "string" && old.url.trim() ? old.url : d.url, enabled: old ? old.enabled !== false : true };
  });
  return out;
}

export function getFocusChain(): FocusChainConfig {
  if (typeof window === "undefined") return defaultFocusChain();
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(FOCUS_CHAIN_KEY);
  } catch {
    /* ignore */
  }
  if (!raw) return defaultFocusChain();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultFocusChain();
  }
  const cfg = normalizeFocusChain(parsed);
  if ((parsed as { version?: unknown })?.version !== 2 || (parsed as { intentRev?: unknown })?.intentRev !== INTENT_REV) {
    try {
      if (!window.localStorage.getItem(BACKUP_KEY)) window.localStorage.setItem(BACKUP_KEY, raw);
      window.localStorage.setItem(FOCUS_CHAIN_KEY, JSON.stringify(cfg));
      scheduleConnectWorkspacePush();
    } catch {
      /* quota */
    }
  }
  return cfg;
}

export function setFocusChain(next: FocusChainConfig) {
  try {
    window.localStorage.setItem(FOCUS_CHAIN_KEY, JSON.stringify(normalizeFocusChain(next)));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(FOCUS_CHAIN_EVENT));
  scheduleConnectWorkspacePush();
}

export function subscribeFocusChain(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === FOCUS_CHAIN_KEY) cb();
  };
  window.addEventListener(FOCUS_CHAIN_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FOCUS_CHAIN_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// ── Laufzeit-Status (nur dieses Gerät) ─────────────────────────────────────────
export type FocusChainState = { phase: "start" | "chain"; index: number; opened: number | null; at: number; done: string[] };

export function getChainState(): FocusChainState {
  try {
    const raw = window.localStorage.getItem(FOCUS_CHAIN_STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as FocusChainState;
      // nach 12 h wieder auf der Big-Boss-Startseite beginnen
      if (Date.now() - (s.at ?? 0) < 12 * 3600e3) return { phase: s.phase === "chain" ? "chain" : "start", index: Number(s.index) || 0, opened: s.opened ?? null, at: s.at, done: Array.isArray(s.done) ? s.done : [] };
    }
  } catch {
    /* ignore */
  }
  return { phase: "start", index: 0, opened: null, at: Date.now(), done: [] };
}

export function saveChainState(s: FocusChainState) {
  try {
    window.localStorage.setItem(FOCUS_CHAIN_STATE_KEY, JSON.stringify({ ...s, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

// ── Öffnen ────────────────────────────────────────────────────────────────────
export function platform(): "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

/**
 * Android, Modus "app": Deep-Link-Intent mit Paket → öffnet die native App direkt am Ziel
 * (z.B. Perplexity im Projekt). Chrome startet nur Activities mit BROWSABLE-Filter, darum
 * Deep-Link statt Launcher-Intent (Launcher-Intents landen in Chrome immer im Fallback).
 * Fallback-URL nur, wenn die App fehlt.
 */
export function androidIntent(url: string, pkg: string, browserFallback = true): string {
  const u = new URL(url);
  const fb = browserFallback ? `S.browser_fallback_url=${encodeURIComponent(url)};` : "";
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=${pkg};${fb}end`;
}

/**
 * Pakete, die nie im Browser landen dürfen: kein Browser-Fallback (fehlt die App, schickt
 * Chrome zum Play Store). Perplexity: www.perplexity.ai ist per assetlinks.json für
 * ai.perplexity.app.android verifiziert → Deep-Link öffnet die App direkt im Projekt.
 */
const APP_ONLY_PACKAGES = [
  "ai.perplexity.app.android",
  // Docs/Drive: mit https-Fallback nahm Chrome bei Stefan immer den Browser (17.10.)
  "com.google.android.apps.docs.editors.docs",
  "com.google.android.apps.docs",
];

/** Launcher-Intent ohne Browser-Fallback (fehlt die App → Play Store, nie Browser). */
export function androidLauncherIntentNoFallback(pkg: string): string {
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};end`;
}

/**
 * Docs/Drive: docs.google.com und drive.google.com sind per assetlinks.json für die Apps
 * verifiziert → immer Deep-Link (App-Link). KEIN Launcher-Intent: Chrome markiert intent:-Aufrufe
 * als BROWSABLE, die Launcher-Activity von Docs/Drive löst das nicht auf → Play Store (17.10.).
 */
const LINK_ONLY_PACKAGES = ["com.google.android.apps.docs.editors.docs", "com.google.android.apps.docs"];

/** Android-Aufruf für App-only-Pakete: [erster Intent, Notlösung nach 1,5 s oder null]. */
export function appOnlyIntents(url: string, pkg: string): [string, string | null] {
  if (LINK_ONLY_PACKAGES.includes(pkg)) return [androidIntent(url, pkg, false), null];
  return [androidIntent(url, pkg, false), androidLauncherIntentNoFallback(pkg)];
}

/** Launcher-Intent (Standard für Gmail, Kontakte, Perplexity). */
export function androidLauncherIntent(url: string, pkg: string): string {
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

/** Setzt authuser=<Konto> bei Google-Links (überschreibt einen vorhandenen Wert). */
export function withGoogleAccount(url: string, account?: string): string {
  const acc = account?.trim();
  if (!acc) return url;
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.com$/i.test(u.hostname)) return url;
    u.searchParams.set("authuser", acc);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Öffnet einen Schritt. Browser erlauben pro Antippen nur ein Fenster/App-Öffnen,
 * darum genau eine Aktion pro Aufruf (muss direkt im Klick-Handler laufen).
 */
export function openExternal(step: Pick<FocusChainStep, "id" | "url" | "android" | "ios" | "openMode" | "intentStyle">, account?: string) {
  const url = withGoogleAccount(step.url.trim(), account);
  if (!url) return;
  const p = platform();
  try {
    if (p === "android") {
      // nie window.open/Custom Tab auf Android: App per Intent, sonst gleiche Seite
      const app = step.openMode !== "browser" && step.android?.trim() && /^https?:/i.test(url);
      const style = step.intentStyle ?? DEFAULT_INTENT_STYLE[step.id] ?? "launcher";
      const pkg = step.android?.trim() ?? "";
      if (app && style === "link" && APP_ONLY_PACKAGES.includes(pkg)) {
        // Deep-Link ohne Browser-Fallback; beansprucht die App den Pfad nicht und bleibt die
        // Seite sichtbar, Notlösung: Launcher-Intent (App ohne Projekt, aber nie Browser).
        const [first, rescue] = appOnlyIntents(url, pkg);
        const started = Date.now();
        window.location.href = first;
        if (rescue) {
          window.setTimeout(() => {
            if (document.visibilityState === "visible" && Date.now() - started < 2500) window.location.href = rescue;
          }, 1500);
        }
        return;
      }
      window.location.href = app
        ? style === "link"
          ? androidIntent(url, pkg)
          : androidLauncherIntent(url, pkg)
        : url;
      return;
    }
    if (p === "ios" && step.ios && step.openMode !== "browser") {
      const started = Date.now();
      window.location.href = step.ios;
      window.setTimeout(() => {
        if (document.visibilityState === "visible" && Date.now() - started < 2500) window.location.href = url;
      }, 1400);
      return;
    }
  } catch {
    /* fall through */
  }
  openFocusTab(url, step.id);
}

const lastFocusOpen = new Map<string, number>();

/**
 * PC (helium-pcfocus2): genau EIN Tab pro Auslösung, bestehender Tab derselben Seite wird
 * fokussiert statt neu angelegt.
 * - Helium mit Connect-Shell-Erweiterung: `openInHeliumTab` → Erweiterung sucht einen Tab mit
 *   gleichem Host + Pfad-Präfix und holt ihn nach vorne, sonst neuer Tab.
 * - Sonst: benanntes Fensterziel `connect-focus-<schritt>` (gleicher Schritt → gleicher Tab).
 * Früher: `window.open(url, "_blank", "noopener")` liefert laut Spezifikation IMMER null →
 * der Fallback `location.href = url` lief jedes Mal mit und machte zusätzlich den Connect-Tab
 * zur Zielseite (= zwei „Google Kontakte"-Tabs).
 * Nie den Connect-Tab überschreiben; doppelte Auslösung (Klick + Enter) innerhalb 800 ms ignoriert.
 */
export function openFocusTab(url: string, key: string): void {
  const target = url.trim();
  if (!target || typeof window === "undefined") return;
  const now = Date.now();
  const last = lastFocusOpen.get(key) ?? 0;
  if (now - last < 800) return;
  lastFocusOpen.set(key, now);
  if (hasConnectShell()) {
    openInHeliumTab(target);
    return;
  }
  let w: Window | null = null;
  try {
    w = window.open(target, `connect-focus-${key.replace(/[^a-z0-9_-]/gi, "-")}`);
  } catch {
    w = null;
  }
  if (!w) return;
  // kein `w.opener = null`: trennt in Chromium die Namenszuordnung → jeder Klick wieder neuer Tab
  try {
    w.focus();
  } catch {
    /* ignorieren */
  }
}

/** Gleiche Domain → Pfad für In-App-Navigation, sonst null. */
export function sameOriginPath(link: string): string | null {
  try {
    const u = new URL(link, window.location.href);
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
  } catch {
    /* ignore */
  }
  return null;
}
