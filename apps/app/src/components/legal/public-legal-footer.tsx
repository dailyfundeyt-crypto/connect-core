/**
 * Public info + legal links for signed-out visitors (sign-in screen).
 *
 * Google's OAuth branding review needs a public homepage that names the app, says what it does and
 * links the privacy policy and terms. The legal pages are static files (`public/datenschutz/`,
 * `public/nutzungsbedingungen/`), so they are opened with a full page load, not the router. On a
 * local install (localhost) those files are not served by every runtime, so the links point at the
 * public web copy there.
 */
const PUBLIC_ORIGIN = "https://connect-kunc-preview.vercel.app";

function legalHref(path: string): string {
  if (typeof window === "undefined") return path;
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  return local ? `${PUBLIC_ORIGIN}${path}` : path;
}

/** `dark`: on the always-dark first-run language screen instead of the themed sign-in screen. */
export function PublicLegalFooter({ dark = false }: { dark?: boolean }) {
  const strong = dark ? "font-medium text-white" : "font-medium text-foreground";
  const link = dark
    ? "underline underline-offset-2 hover:text-white"
    : "underline underline-offset-2 hover:text-foreground";
  return (
    <footer
      className={`w-full max-w-md px-4 pb-6 text-center text-xs leading-relaxed ${dark ? "text-white/60" : "text-muted-foreground"}`}
    >
      <p lang="de">
        <strong className={strong}>Connect</strong> ist ein Arbeitsbereich für
        KI-Agenten: Firmen, Projekte und Agenten an einem Ort, Chats mit deinen Agenten, gemeinsames
        Wissen und optional eine verschlüsselte Sicherung in deinem Google Drive.
      </p>
      <nav aria-label="Rechtliches" className="mt-2 flex items-center justify-center gap-3" lang="de">
        <a className={link} href={legalHref("/datenschutz")}>
          Datenschutzerklärung
        </a>
        <span aria-hidden="true">·</span>
        <a className={link} href={legalHref("/nutzungsbedingungen")}>
          Nutzungsbedingungen
        </a>
      </nav>
      <p className="mt-1" lang="de">© 2026 Kunc GmbH</p>
    </footer>
  );
}
