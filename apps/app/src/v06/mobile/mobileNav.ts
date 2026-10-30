/** v06 mobileV2 (A14): Mobile-Navigation. Flag aus = bisherige Seiten / Analysis. */
import { FLAGS_V06 } from "@/contracts/v06/flags";
import { ROUTES_V06 } from "@/contracts/v06/routes-ui";

export type MobilePageId = "focus" | "chats" | "browser" | "companies" | "social" | "analysis";

export interface MobileNavItem {
  id: MobilePageId;
  label: string;
  route: string;
}

export const MOBILE_SOCIAL_LABEL_V2 = "Connect Sozial";
export const MOBILE_SOCIAL_LABEL_LEGACY = "Analysis";
export const MOBILE_SOCIAL_ROUTE_V2: string = ROUTES_V06.social;
export const MOBILE_SOCIAL_ROUTE_LEGACY = "/analysis";

/** Beschriftung des Platzes 'social' (ehemals 'Analysis'). */
export function socialPageLabel(mobileV2: boolean = FLAGS_V06.mobileV2): string {
  return mobileV2 ? MOBILE_SOCIAL_LABEL_V2 : MOBILE_SOCIAL_LABEL_LEGACY;
}

export function socialPageLabelForFlags(flags: { mobileV2: boolean } = FLAGS_V06): string {
  return socialPageLabel(flags.mobileV2);
}

/** Route des Platzes 'social' / 'analysis'. */
export function socialPageRoute(mobileV2: boolean = FLAGS_V06.mobileV2): string {
  return mobileV2 ? MOBILE_SOCIAL_ROUTE_V2 : MOBILE_SOCIAL_ROUTE_LEGACY;
}

/** Definition des Social/Analysis Navigationseintrags je nach Flag. */
export function getSocialNavItem(mobileV2: boolean = FLAGS_V06.mobileV2): MobileNavItem {
  if (mobileV2) {
    return {
      id: "social",
      label: MOBILE_SOCIAL_LABEL_V2,
      route: MOBILE_SOCIAL_ROUTE_V2,
    };
  }
  return {
    id: "social",
    label: MOBILE_SOCIAL_LABEL_LEGACY,
    route: MOBILE_SOCIAL_ROUTE_LEGACY,
  };
}

/**
 * Ermittelt, ob die Social/Analysis-Seite in der Navigation angezeigt werden soll.
 * Wenn mobileV2 aktiv ist, wird Connect Sozial angezeigt.
 * Wenn mobileV2 aus ist, steuert das Legacy-Flag social2 (oder Default true) die Sichtbarkeit.
 */
export function isSocialPageVisible(options?: { mobileV2?: boolean; legacySocial2?: boolean }): boolean {
  const mobileV2 = options?.mobileV2 ?? FLAGS_V06.mobileV2;
  if (mobileV2) return true;
  return options?.legacySocial2 ?? true;
}

export interface MobilePageMeta {
  id: "focus" | "chats" | "browser" | "companies" | "social";
  label: string;
  route?: string;
}

/**
 * Gibt die vollständige Seitenliste für MobileHome zurück.
 */
export function getMobileNavPages(options?: {
  mobileV2?: boolean;
  legacySocial2?: boolean;
}): MobilePageMeta[] {
  const mobileV2 = options?.mobileV2 ?? FLAGS_V06.mobileV2;
  const socialItem = getSocialNavItem(mobileV2);

  const pages: MobilePageMeta[] = [
    { id: "focus", label: "Fokus", route: "/" },
    { id: "chats", label: "Chats", route: "/chats" },
    { id: "browser", label: "Browser", route: "/browser" },
    { id: "companies", label: "Unternehmen", route: "/companies" },
  ];

  if (isSocialPageVisible(options)) {
    pages.push({
      id: "social",
      label: socialItem.label,
      route: socialItem.route,
    });
  }

  return pages;
}
