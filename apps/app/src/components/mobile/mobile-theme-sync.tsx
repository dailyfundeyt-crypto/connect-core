import { useLayoutEffect } from "react";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { getStoredTheme, resolveTheme, subscribeTheme } from "@/lib/theme";
import {
  isThemeV2Active,
  resolveCurrentTheme,
  subscribeThemePreference,
} from "@/v06/theme/themeStore";

const MOBILE_BG = "#07080c";

/**
 * Mobile Theme Synchronization (v06 / Lane 2):
 * Ensures consistent dark appearance and theme adherence on mobile devices.
 * Respects user preferences while preventing white frame flashes on portals,
 * sheets, dialogs, and navigation transitions.
 */
export function MobileThemeSync() {
  const mobile = useMobileShell();
  const isV2 = isThemeV2Active();

  useLayoutEffect(() => {
    if (!mobile) return;

    const html = document.documentElement;
    html.classList.add("connect-mobile-ui");

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = meta?.content;

    if (isV2) {
      const applyMobileThemeV2 = (resolved = resolveCurrentTheme()) => {
        const isDark = resolved === "dark";
        html.classList.toggle("dark", isDark);
        html.style.colorScheme = resolved;
        if (meta) meta.content = isDark ? MOBILE_BG : "#ffffff";
      };

      applyMobileThemeV2();

      const unsubscribe = subscribeThemePreference((_pref, resolved) => {
        applyMobileThemeV2(resolved);
      });

      return () => {
        unsubscribe();
        html.classList.remove("connect-mobile-ui");
        if (meta && previousTheme !== undefined) meta.content = previousTheme;
      };
    } else {
      const applyMobileThemeLegacy = (theme = getStoredTheme()) => {
        const resolved = resolveTheme(theme);
        const isDark = resolved === "dark";
        html.classList.toggle("dark", isDark);
        html.style.colorScheme = resolved;
        if (meta) meta.content = isDark ? MOBILE_BG : "#ffffff";
      };

      applyMobileThemeLegacy();

      const unsubscribe = subscribeTheme((theme) => {
        applyMobileThemeLegacy(theme);
      });

      return () => {
        unsubscribe();
        html.classList.remove("connect-mobile-ui");
        if (meta && previousTheme !== undefined) meta.content = previousTheme;
      };
    }
  }, [mobile, isV2]);

  return null;
}

export default MobileThemeSync;
