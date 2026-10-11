import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getLocale,
  LOCALE_OPTIONS,
  localeLabel,
  setLocale,
  subscribeLocale,
  t,
  type Locale,
} from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

/**
 * First-run language entry. Blocks the app until a language is chosen.
 */
export function LanguageGate({ children }: { children: React.ReactNode }) {
  const [locale, setLoc] = useState<Locale | null>(() => getLocale());

  useEffect(() => subscribeLocale(() => setLoc(getLocale())), []);

  useEffect(() => {
    if (locale) {
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    }
  }, [locale]);

  if (locale) return children;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="w-full max-w-2xl space-y-6 rounded-3xl border border-white/15 bg-white/[0.06] p-8 backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("lang.title", "de")} · {t("lang.title", "en")}
          </h1>
          <p className="mt-2 text-sm text-white/55">
            {t("lang.subtitle", "de")}
          </p>
          <p className="mt-1 text-sm text-white/45">{t("lang.subtitle", "en")}</p>
        </div>
        <div className="grid max-h-[min(60vh,28rem)] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {LOCALE_OPTIONS.map(({ code, label, hint }) => (
            <button
              className={cn(
                "rounded-2xl border border-white/20 bg-white/10 px-4 py-4 text-left transition hover:bg-white/20",
              )}
              key={code}
              onClick={() => setLoc(setLocale(code))}
              type="button"
            >
              <span className="block text-base font-semibold">{label}</span>
              <span className="mt-1 block text-[11px] text-white/50">{hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Language switcher for Settings — all supported locales. */
export function LanguageSwitcher() {
  const [locale, setLoc] = useState<Locale>(() => getLocale() ?? "de");
  useEffect(() => subscribeLocale(() => setLoc(getLocale() ?? "de")), []);

  return (
    <select
      aria-label={t("settings.language", locale)}
      className="h-9 max-w-[14rem] rounded-lg border border-border bg-background px-2 text-sm"
      onChange={(e) => {
        const next = e.target.value as Locale;
        setLoc(setLocale(next));
      }}
      value={locale}
    >
      {LOCALE_OPTIONS.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** Compact chip row (optional alternate UI). */
export function LanguageChips() {
  const [locale, setLoc] = useState<Locale>(() => getLocale() ?? "de");
  useEffect(() => subscribeLocale(() => setLoc(getLocale() ?? "de")), []);

  return (
    <div className="flex flex-wrap gap-1.5">
      {LOCALE_OPTIONS.map((opt) => (
        <Button
          key={opt.code}
          onClick={() => setLoc(setLocale(opt.code))}
          size="sm"
          type="button"
          variant={locale === opt.code ? "default" : "outline"}
        >
          {localeLabel(opt.code)}
        </Button>
      ))}
    </div>
  );
}

/** Browser-local label in the active language. */
export function BrowserLocalLabel({ className }: { className?: string }) {
  const { t: tr } = useLocaleSafe();
  return (
    <span className={cn("font-medium text-muted-foreground", className)}>
      {tr("browser.local")}
    </span>
  );
}

function useLocaleSafe() {
  const [locale, setLoc] = useState<Locale | null>(() => getLocale());
  useEffect(() => subscribeLocale(() => setLoc(getLocale())), []);
  return {
    locale,
    t: (key: Parameters<typeof t>[0]) => t(key, locale),
  };
}
