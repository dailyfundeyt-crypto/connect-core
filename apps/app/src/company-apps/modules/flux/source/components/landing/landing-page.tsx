import { useEffect, useState, type ReactNode } from "react";import {
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Globe,
  Layers,
  LineChart,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Star,
  Wand2,
  Zap,
} from "lucide-react";

type LogoProps = { size?: number; className?: string };
function FluxLogo({ size = 44, className = "" }: LogoProps) {
  // Echtes Logo-Asset (cyan/sky-teal Glow) aus /public/flux-logo.png
  return (
    <img
      src="/flux-logo.png"
      alt="Flux Logo"
      width={size}
      height={size}
      className={`${className} rounded-xl object-cover`}
      style={{ filter: "drop-shadow(0 0 14px rgba(56,189,248,0.45))" }}
    />
  );
}

const Feature = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06]">
    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-sky-300/70 transition-colors group-hover:text-sky-200">
      <span>Mehr erfahren</span>
      <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
    </div>
  </div>
);

const SourceCard = ({
  icon,
  name,
  tag,
}: {
  icon: ReactNode;
  name: string;
  tag: string;
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm transition-colors hover:bg-white/[0.07]">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-white">{name}</p>
      <p className="text-[11px] text-white/40">{tag}</p>
    </div>
  </div>
);

const Plan = ({
  name,
  price,
  tagline,
  highlight,
  features,
}: {
  name: string;
  price: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
}) => (
  <div
    className={`relative flex flex-col rounded-3xl border p-6 backdrop-blur-sm transition-all ${
      highlight
        ? "border-sky-400/40 bg-gradient-to-b from-sky-400/10 via-violet-400/5 to-transparent shadow-[0_24px_80px_-24px_rgba(56,189,248,0.45)]"
        : "border-white/10 bg-white/[0.03]"
    }`}
  >
    {highlight && (
      <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
        <Sparkles className="h-3 w-3" /> Empfohlen
      </span>
    )}
    <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">{name}</p>
    <p className="mt-3 text-4xl font-bold text-white">
      {price}
      <span className="ml-1 text-sm font-medium text-white/40">/ Monat</span>
    </p>
    <p className="mt-2 text-sm text-white/50">{tagline}</p>
    <ul className="mt-6 space-y-2.5">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm text-white/70">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <a
      href="/"
      className={`mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition-all ${
        highlight
          ? "bg-gradient-to-r from-sky-400 to-cyan-300 text-slate-950 hover:from-sky-300 hover:to-cyan-200 shadow-[0_12px_30px_-12px_rgba(56,189,248,0.7)]"
          : "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
      }`}
    >
      {highlight ? "Jetzt starten" : "Mehr erfahren"}
      <ChevronRight className="h-4 w-4" />
    </a>
  </div>
);

export function LandingPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const sources: { icon: ReactNode; name: string; tag: string }[] = [
    { icon: <FileSpreadsheet className="h-4 w-4" />, name: "Google Sheets", tag: "Live-Sync · Spalten zu Feldern" },
    { icon: <FileText className="h-4 w-4" />, name: "CSV Upload", tag: "Drag & Drop · jede Spalte zählbar" },
    { icon: <Globe className="h-4 w-4" />, name: "Shopify", tag: "Produkte & Varianten importieren" },
    { icon: <Boxes className="h-4 w-4" />, name: "eBay", tag: "Auto-Poster · OAuth · Tarife" },
    { icon: <PlugZap className="h-4 w-4" />, name: "Kleinanzeigen", tag: "Direkt-Poster · Versand & Mehr" },
  ];

  const features = [
    {
      icon: <Wand2 className="h-5 w-5" />,
      title: "AI schreibt deine Titel",
      description: "Generiert SEO-Titel, Beschreibungen und Keywords aus Foto, EAN oder Kategorie.",
    },
    {
      icon: <Layers className="h-5 w-5" />,
      title: "Einmal erfassen, fünfmal listen",
      description: "Sheets, CSV, Shopify, eBay und Kleinanzeigen — ein Produkt, alle Kanäle, ein Klick.",
    },
    {
      icon: <LineChart className="h-5 w-5" />,
      title: "Live-Umsatz pro Kanal",
      description: "Sieh Marge, Versandkosten und Deckungsbeitrag pro Plattform in Echtzeit.",
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Auto-Poster",
      description: "Ein Toggle reicht. Flux postet neue Items automatisch in die Kanäle deiner Wahl.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "EU-Datenschutz",
      description: "Supabase EU, keine US-Trainings, keine Datenweitergabe an Dritte.",
    },
    {
      icon: <Star className="h-5 w-5" />,
      title: "Für Flippers gemacht",
      description: "Einkauf, Listing, Versand, Marge — der komplette Warenhandel in einer App.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08090d] text-white">
      {/* Ambient Glow */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute inset-0 hero-glow" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "84px 84px",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#08090d]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-3">
            <FluxLogo size={36} />
            <span className="text-lg font-bold tracking-tight">Flux</span>
          </a>
          <div className="hidden items-center gap-1 sm:flex">
            <a href="#features" className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
              Features
            </a>
            <a href="#sources" className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
              Quellen
            </a>
            <a href="#plans" className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
              Tarife
            </a>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.08] sm:inline-flex"
            >
              Anmelden
            </a>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-8px_rgba(56,189,248,0.6)] hover:from-sky-300 hover:to-cyan-200"
            >
              App öffnen <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-24">
        <div
          className={`mx-auto max-w-4xl text-center transition-all duration-1000 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1.5 text-xs text-sky-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
            Multiposter · Sheets, CSV, Shopify, eBay & Kleinanzeigen
          </div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            Ein Produkt.
            <br />
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Alle Kanäle.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/55 sm:text-xl">
            Flux liest deine Sheets, CSVs und Shopify-Shops — und posted neue Items automatisch auf
            eBay und Kleinanzeigen. Mit AI-Titeln, Live-Marge und EU-Datenschutz.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/app/dashboard?demo=1"
              onClick={() => { try { localStorage.setItem('flux_demo', '1') } catch {} }}
              className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 px-7 py-4 text-base font-semibold text-slate-950 shadow-[0_24px_60px_-20px_rgba(56,189,248,0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-20px_rgba(56,189,248,0.85)]"
            >
              Kostenlos starten
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-7 py-4 text-base font-semibold text-white/85 backdrop-blur-sm hover:bg-white/[0.08]"
            >
              Demo ansehen
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-300" /> Keine Kreditkarte
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-300" /> Supabase EU
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-300" /> Google-Anmeldung
            </span>
          </div>
        </div>

        {/* Hero Mock – Phone / Multiposter Preview */}
        <div
          className={`relative mt-16 w-full max-w-5xl transition-all delay-300 duration-1000 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_60px_120px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            <div className="rounded-2xl bg-gradient-to-b from-[#0d1018] to-[#08090d] p-5 sm:p-7">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <div className="flex-1 text-center text-[11px] tracking-wider text-white/30">
                  flux.app / multiposter
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                {/* Source-Sidebar Mock */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    Quellen
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {sources.map((s, i) => (
                      <div
                        key={s.name}
                        className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs ${
                          i === 0
                            ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-400/30"
                            : "text-white/60"
                        }`}
                      >
                        <span className="text-sky-300/80">{s.icon}</span>
                        <span className="truncate font-medium">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main mock: Multiposter */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/80">
                        Multiposter
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        A-00042 · Dark Side of the Moon
                      </h3>
                      <p className="text-xs text-white/45">
                        AI-Titel, Auto-Poster aktiv · 2 Kanäle
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Live
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/40">Preis</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">€ 28,00</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/40">Marge</p>
                      <p className="mt-0.5 text-sm font-semibold text-sky-300">34 %</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/40">Reichweite</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">2 Stores</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/55">
                    <span>Zuletzt gepostet · vor 3 Min</span>
                    <span className="inline-flex items-center gap-1 text-sky-200">
                      View on eBay <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sources */}
      <section id="sources" className="relative px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-300/80">
              Quellen
            </p>
            <h2 className="bg-gradient-to-br from-white to-white/55 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              Wo deine Produkte herkommen.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {sources.map((s) => (
              <SourceCard key={s.name} {...s} />
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-300/80">
              Features
            </p>
            <h2 className="bg-gradient-to-br from-white to-white/55 bg-clip-text text-3xl font-bold text-transparent sm:text-5xl">
              Alles, was dein Warenhandel braucht.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Feature key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-300/80">
              Tarife
            </p>
            <h2 className="bg-gradient-to-br from-white to-white/55 bg-clip-text text-3xl font-bold text-transparent sm:text-5xl">
              Starte gratis. Wachse mit deinem Lager.
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Plan
              name="Free"
              price="0 €"
              tagline="Zum Ausprobieren."
              features={["50 Produkte", "1 Quelle", "Sheets + CSV", "Community-Support"]}
            />
            <Plan
              name="Starter"
              price="5 €"
              tagline="Für die ersten Verkäufe."
              features={["500 Produkte", "2 Quellen", "Auto-Poster eBay", "E-Mail-Support"]}
            />
            <Plan
              name="Pro"
              price="19 €"
              tagline="Für aktive Verkäufer."
              highlight
              features={[
                "Unlimited Produkte",
                "Alle 5 Quellen",
                "AI-Beschreibungen",
                "Auto-Poster eBay + Kleinanzeigen",
                "Live-Umsatz pro Kanal",
                "Prioritäts-Support",
              ]}
            />
            <Plan
              name="Enterprise"
              price="Auf Anfrage"
              tagline="Großhändler, Agenturen, Reseller."
              features={["Multi-Account", "API + Webhooks", "SSO", "Dedizierter Support"]}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="relative overflow-hidden rounded-3xl border border-sky-400/30 bg-gradient-to-br from-sky-400/10 via-violet-500/10 to-transparent p-10 backdrop-blur-xl">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/30 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />
            <div className="relative">
              <h2 className="bg-gradient-to-br from-white to-white/70 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
                Bereit, alles in einen Fluss zu bringen?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-white/55">
                Starte jetzt kostenlos. Keine Kreditkarte. EU-Daten.
              </p>
              <a
                href="/"
                className="mt-7 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-7 py-4 text-base font-semibold text-slate-950 shadow-[0_24px_60px_-20px_rgba(56,189,248,0.7)] hover:from-sky-300 hover:to-cyan-200"
              >
                Kostenlos starten <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <FluxLogo size={28} />
            <span className="font-semibold text-white/70">Flux</span>
          </div>
          <p className="text-xs text-white/35">
            © 2026 Flux · Multiposter für Sheets, CSV, Shopify, eBay & Kleinanzeigen
          </p>
          <div className="flex items-center gap-4 text-xs text-white/35">
            <a href="#" className="hover:text-white/65">Datenschutz</a>
            <a href="#" className="hover:text-white/65">AGB</a>
            <a href="#" className="hover:text-white/65">Impressum</a>
          </div>
        </div>
      </footer>
    </div>
  );
}