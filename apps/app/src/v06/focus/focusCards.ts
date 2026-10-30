import {
  FOCUS_ORDER_V2,
  type FocusCardId,
  type FocusTarget,
} from "@/contracts/v06/focus";
import { EXTERNAL_LINKS } from "@connect/contracts";

export { FOCUS_ORDER_V2, type FocusCardId, type FocusTarget };

/** Setting key for Grok-Bot focus target URL / deep link */
export const FOCUS_GROKBOT_SETTING_KEY = "focus.grokbotTarget";

/** Fallback URL according to docs/v06/DECISIONS.md (Entscheidung 2) */
export const GROKBOT_DEFAULT_TARGET = EXTERNAL_LINKS?.grokBot || "https://grok.com";

/** UI hint when target has not been customized */
export const GROKBOT_SETTING_HINT = "Grok-Bot-Ziel in Einstellungen festlegen";

/**
 * Preserved reference to legacy Perplexity URL (Rule 2: never delete existing targets).
 * In v06 this is preserved for backwards compatibility and fallback references, but not active.
 */
export const LEGACY_PERPLEXITY_TARGET =
  "https://www.perplexity.ai/projects/ebfe6bd3-7161-40e9-bd6a-690845a7aa12";

export interface FocusCardDefinition {
  id: FocusCardId;
  name: string;
  task: string;
  url: string;
  opens: FocusTarget["opens"];
  android?: string;
  ios?: string;
  openMode?: "app" | "browser";
  intentStyle?: "launcher" | "link";
  enabled: boolean;
  target: FocusTarget;
  hint?: string;
  isCustomTarget?: boolean;
}

/**
 * Reads the Grok-Bot target URL / deeplink from localStorage setting (focus.grokbotTarget).
 * Returns default if missing or empty, along with a hint to configure it in settings.
 */
export function readGrokbotTarget(): {
  target: string;
  isCustom: boolean;
  hint?: string;
} {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(FOCUS_GROKBOT_SETTING_KEY);
      if (stored && stored.trim().length > 0) {
        return { target: stored.trim(), isCustom: true };
      }
    } catch {
      /* ignore quota or privacy errors */
    }
  }
  return {
    target: GROKBOT_DEFAULT_TARGET,
    isCustom: false,
    hint: GROKBOT_SETTING_HINT,
  };
}

/**
 * Generates the cards array strictly from FOCUS_ORDER_V2.
 * Canonical v06 order:
 * 1. plan: "Planung" (Docs)
 * 2. datenbank: "Datenbank" (Drive)
 * 3. aufgaben: "Aufgabenzuweisung" (Grok Bot)
 * 4. emails: "E-Mails" (Gmail)
 * Agenten-Kontakte is omitted in v06.
 */
export function getFocusCardsV2(options?: {
  googleAccount?: string;
  grokbotTarget?: string;
}): FocusCardDefinition[] {
  const grok = options?.grokbotTarget
    ? { target: options.grokbotTarget, isCustom: true, hint: undefined }
    : readGrokbotTarget();

  const account = options?.googleAccount ?? "dailyfunde.yt@gmail.com";
  const authUserSuffix = account ? `?authuser=${encodeURIComponent(account)}` : "";

  return FOCUS_ORDER_V2.map((cardId): FocusCardDefinition => {
    switch (cardId) {
      case "plan": {
        const url = `https://docs.google.com/document/u/0/${authUserSuffix}`;
        return {
          id: "plan",
          name: "Planung",
          task: "Pläne in Docs schreiben (Plan-Modus)",
          url,
          opens: "docs",
          android: "com.google.android.apps.docs.editors.docs",
          intentStyle: "link",
          openMode: "app",
          enabled: true,
          target: { cardId: "plan", opens: "docs", url },
        };
      }
      case "datenbank": {
        const url = `https://drive.google.com/drive/my-drive${account ? `?authuser=${encodeURIComponent(account)}&hl=de` : "?hl=de"}`;
        return {
          id: "datenbank",
          name: "Datenbank",
          task: "Dateien in der Datenbank wählen",
          url,
          opens: "database",
          android: "com.google.android.apps.docs",
          intentStyle: "link",
          openMode: "app",
          enabled: true,
          target: { cardId: "datenbank", opens: "database", url },
        };
      }
      case "aufgaben": {
        return {
          id: "aufgaben",
          name: "Aufgabenzuweisung",
          task: "Grok Bot gibt den anderen Agenten die Aufträge",
          url: grok.target,
          opens: "grokbot",
          openMode: "browser",
          enabled: true,
          hint: grok.hint,
          isCustomTarget: grok.isCustom,
          target: { cardId: "aufgaben", opens: "grokbot", url: grok.target },
        };
      }
      case "emails": {
        const url = `https://mail.google.com/mail/${authUserSuffix}`;
        return {
          id: "emails",
          name: "E-Mails",
          task: "E-Mail, um zu überprüfen, ob die Aufträge erfüllt sind",
          url,
          opens: "email",
          android: "com.google.android.gm",
          ios: "googlegmail://",
          openMode: "app",
          intentStyle: "launcher",
          enabled: true,
          target: { cardId: "emails", opens: "email", url },
        };
      }
    }
  });
}

/** Precomputed v06 cards array for default settings */
export const FOCUS_CARDS_V2: FocusCardDefinition[] = getFocusCardsV2();
