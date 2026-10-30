import { describe, expect, test } from "bun:test";
import {
  MOBILE_SOCIAL_LABEL_LEGACY,
  MOBILE_SOCIAL_LABEL_V2,
  MOBILE_SOCIAL_ROUTE_LEGACY,
  MOBILE_SOCIAL_ROUTE_V2,
  getMobileNavPages,
  getSocialNavItem,
  isSocialPageVisible,
  socialPageLabel,
  socialPageLabelForFlags,
  socialPageRoute,
} from "./mobileNav";

describe("mobileNav (A14)", () => {
  test("mobileV2 an: Platz heisst Connect Sozial", () => {
    expect(socialPageLabel(true)).toBe(MOBILE_SOCIAL_LABEL_V2);
  });

  test("mobileV2 aus: Platz heisst weiterhin Analysis", () => {
    expect(socialPageLabel(false)).toBe(MOBILE_SOCIAL_LABEL_LEGACY);
  });

  test("Default-Flag ist aus (FLAGS_V06.mobileV2 = false)", () => {
    expect(socialPageLabelForFlags()).toBe(MOBILE_SOCIAL_LABEL_LEGACY);
  });

  test("socialPageRoute liefert ROUTES_V06.social bei mobileV2 an", () => {
    expect(socialPageRoute(true)).toBe("/social");
    expect(socialPageRoute(true)).toBe(MOBILE_SOCIAL_ROUTE_V2);
  });

  test("socialPageRoute liefert /analysis bei mobileV2 aus", () => {
    expect(socialPageRoute(false)).toBe(MOBILE_SOCIAL_ROUTE_LEGACY);
  });

  test("getSocialNavItem liefert korrektes Item je nach Flag", () => {
    const itemV2 = getSocialNavItem(true);
    expect(itemV2).toEqual({
      id: "social",
      label: "Connect Sozial",
      route: "/social",
    });

    const itemLegacy = getSocialNavItem(false);
    expect(itemLegacy).toEqual({
      id: "social",
      label: "Analysis",
      route: "/analysis",
    });
  });

  test("isSocialPageVisible beachtet mobileV2 und legacy Fallback", () => {
    // Wenn mobileV2 true ist, immer sichtbar
    expect(isSocialPageVisible({ mobileV2: true, legacySocial2: false })).toBe(true);
    expect(isSocialPageVisible({ mobileV2: true, legacySocial2: true })).toBe(true);

    // Wenn mobileV2 false ist, folgt es legacySocial2
    expect(isSocialPageVisible({ mobileV2: false, legacySocial2: true })).toBe(true);
    expect(isSocialPageVisible({ mobileV2: false, legacySocial2: false })).toBe(false);
  });

  test("getMobileNavPages erzeugt 5 Seiten bei mobileV2 an", () => {
    const pages = getMobileNavPages({ mobileV2: true });
    expect(pages.length).toBe(5);
    expect(pages[4]).toEqual({
      id: "social",
      label: "Connect Sozial",
      route: "/social",
    });
  });

  test("getMobileNavPages erzeugt Analysis-Seite bei mobileV2 aus und legacySocial2 an", () => {
    const pages = getMobileNavPages({ mobileV2: false, legacySocial2: true });
    expect(pages.length).toBe(5);
    expect(pages[4]).toEqual({
      id: "social",
      label: "Analysis",
      route: "/analysis",
    });
  });

  test("getMobileNavPages lässt Social weg bei mobileV2 aus und legacySocial2 aus", () => {
    const pages = getMobileNavPages({ mobileV2: false, legacySocial2: false });
    expect(pages.length).toBe(4);
    expect(pages.some((p) => p.id === "social")).toBe(false);
  });
});
