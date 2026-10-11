import { useLayoutEffect } from "react";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";

const MOBILE_BG = "#07080c";

/**
 * Handy-Version (helium-mobile4): hält den dunklen Tech-Look auf JEDER Seite,
 * nicht nur auf "/" und im Chat – Einstellungen, Agent-Einstellungen, Sheets,
 * Menüs und das Computer-/Chrome-Fenster (die per Portal am <body> hängen und
 * deshalb vorher hell gerendert wurden).
 *
 * Setzt nur die Klasse `connect-mobile-ui` auf <html> (nicht `dark`, damit der
 * ThemeProvider des Desktops nichts überschreibt). Tailwinds `dark:`-Variante und
 * die Farb-Tokens greifen über diese Klasse (styles.css). Desktop: nie aktiv.
 */
export function MobileThemeSync() {
  const mobile = useMobileShell();
  useLayoutEffect(() => {
    if (!mobile) return;
    const html = document.documentElement;
    html.classList.add("connect-mobile-ui");
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = meta?.content;
    if (meta) meta.content = MOBILE_BG;
    return () => {
      html.classList.remove("connect-mobile-ui");
      if (meta && previousTheme !== undefined) meta.content = previousTheme;
    };
  }, [mobile]);
  return null;
}
