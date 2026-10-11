import {
  IconArrowRight,
  IconBrain,
  IconBuildingSkyscraper,
  IconChevronDown,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconLock,
  IconRobot,
  IconShieldLock,
  IconSparkles,
  IconWorldWww,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import AgentOrb from "@/components/agents/orb/agent-orb";
import { PublicLegalFooter } from "@/components/legal/public-legal-footer";
import "./premium-landing.css";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Öffentliche Startseite für Besucher ohne Anmeldung (Desktop + Web).
 *
 * Premium-Look wie die Handy-Version: tiefes Schwarz, Glas, ein lebendiger Orb, ruhige Bewegung.
 * Die eigentlichen Anmelde-Knöpfe kommen von `sign.tsx` (`signIn`), damit Google-Login, SSO und
 * Fehlermeldungen genau so funktionieren wie vorher.
 */
export function PremiumLanding({
  signIn,
  signInCompact,
  error,
}: {
  /** Großer Anmeldebereich (Hero + Abschluss). */
  signIn: ReactNode;
  /** Kleiner Knopf oben rechts in der Leiste. */
  signInCompact: ReactNode;
  error?: string | null;
}) {
  const reduce = useReducedMotion();
  const rise = (delay = 0) => ({
    initial: { opacity: 0, y: reduce ? 0 : 18, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.8, ease: EASE, delay },
  });
  const inView = (delay = 0) => ({
    initial: { opacity: 0, y: reduce ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.7, ease: EASE, delay },
  });

  return (
    <div className="cxl-root relative min-h-dvh w-full overflow-x-hidden text-white" lang="de">
      <div aria-hidden className="cxl-aurora" />
      <div aria-hidden className="cxl-grid" />

      {/* Leiste */}
      <header className="cxl-nav fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
          <a className="flex items-center gap-2.5" href="#top">
            <img alt="" className="size-7 rounded-full" src="/brand/connect-logo.png" />
            <span className="text-[15px] font-semibold tracking-tight">Connect</span>
          </a>
          <nav className="hidden items-center gap-7 text-[13px] text-white/55 md:flex">
            <a className="transition-colors hover:text-white" href="#funktionen">Funktionen</a>
            <a className="transition-colors hover:text-white" href="#ablauf">So geht’s</a>
            <a className="transition-colors hover:text-white" href="#sicherheit">Sicherheit</a>
          </nav>
          <div className="ml-auto">{signInCompact}</div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-36 text-center" id="top">
        <div aria-hidden className="cxl-orb-wrap">
          <AgentOrb
            animationDuration={26}
            className="cxl-orb"
            colors={{ bg: "#09090b", c1: "#38bdf8", c2: "#a78bfa", c3: "#1e3a8a", c4: "#f472b6" }}
            size="460px"
          />
        </div>

        <motion.a {...rise(0)} className="cxl-pill relative z-10 mb-8" href="#funktionen">
          <IconSparkles className="size-3.5 text-sky-300" />
          <span>Neu: Agent-Browser, Connect Notch und Auftrag-Menü</span>
          <IconArrowRight className="size-3.5 text-white/50" />
        </motion.a>

        <motion.h1 {...rise(0.08)} className="cxl-h1 relative z-10">
          Deine Firma.
          <br />
          <span className="cxl-gradient-text">Geführt von KI-Agenten.</span>
        </motion.h1>

        <motion.p {...rise(0.16)} className="relative z-10 mt-6 max-w-2xl text-[17px] leading-relaxed text-white/60">
          Connect bündelt Unternehmen, Agenten, Chats und Browser an einem Ort. Lokal auf deinem PC,
          synchron auf dem Handy, verschlüsselt gesichert in deinem Google Drive.
        </motion.p>

        <motion.div {...rise(0.24)} className="relative z-10 mt-10 flex w-full max-w-sm flex-col items-center gap-3">
          {signIn}
          {error ? (
            <p className="text-sm text-red-400" role="alert">{error}</p>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-white/40">
            <IconLock className="size-3.5" /> Anmeldung mit deinem Google-Konto. Kein Passwort.
          </p>
        </motion.div>

        <motion.a {...rise(0.4)} aria-label="Weiter" className="relative z-10 mt-14 text-white/30 transition-colors hover:text-white/70" href="#vorschau">
          <IconChevronDown className="cxl-bounce size-5" />
        </motion.a>
      </section>

      {/* Produkt-Vorschau */}
      <section className="relative mx-auto mt-10 max-w-6xl px-6" id="vorschau">
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 40, rotateX: reduce ? 0 : 12 }}
          transition={{ duration: 1.1, ease: EASE }}
          viewport={{ once: true, margin: "-60px" }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          style={{ transformPerspective: 1400 }}
        >
          <AppPreview />
        </motion.div>
      </section>

      {/* Funktionen */}
      <section className="relative mx-auto mt-36 max-w-6xl px-6" id="funktionen">
        <motion.div {...inView()} className="mx-auto max-w-2xl text-center">
          <p className="cxl-eyebrow">Funktionen</p>
          <h2 className="cxl-h2 mt-4">Alles, was deine Agenten brauchen.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/50">
            Gebaut für Menschen, die mit einem Team aus KI-Agenten arbeiten. Klar, schnell und ohne Ballast.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div {...inView(0.05 * i)} className="cxl-card group" key={f.title}>
              <div className="cxl-card-icon">{f.icon}</div>
              <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Ablauf */}
      <section className="relative mx-auto mt-36 max-w-6xl px-6" id="ablauf">
        <motion.div {...inView()} className="mx-auto max-w-2xl text-center">
          <p className="cxl-eyebrow">So geht’s</p>
          <h2 className="cxl-h2 mt-4">In drei Schritten startklar.</h2>
        </motion.div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div {...inView(0.08 * i)} className="cxl-step" key={s.title}>
              <span className="cxl-step-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-[17px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Sicherheit */}
      <section className="relative mx-auto mt-36 max-w-6xl px-6" id="sicherheit">
        <motion.div {...inView()} className="cxl-security">
          <div className="max-w-xl">
            <p className="cxl-eyebrow">Sicherheit</p>
            <h2 className="cxl-h2 mt-4">Deine Daten bleiben deine.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">
              Connect speichert lokal auf deinem PC. Sicherungen landen AES-256-verschlüsselt in deinem
              eigenen Google Drive, API-Schlüssel liegen verschlüsselt auf dem Server. Google-Zugriff nur
              auf die Dateien, die Connect selbst anlegt.
            </p>
          </div>
          <ul className="grid gap-3 text-[13.5px] text-white/70">
            {[
              "Anmeldung mit Google, ohne Passwort",
              "AES-256-GCM-verschlüsselte Sicherung",
              "Drive-Zugriff nur auf eigene Dateien",
              "Server in der EU (Frankfurt)",
            ].map((line) => (
              <li className="flex items-center gap-3" key={line}>
                <span className="cxl-check">
                  <IconShieldLock className="size-3.5" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* Abschluss */}
      <section className="relative mx-auto mt-36 mb-16 max-w-6xl px-6">
        <motion.div {...inView()} className="cxl-final">
          <div aria-hidden className="cxl-final-glow" />
          <h2 className="cxl-h2 relative">Bereit für dein Agenten-Team?</h2>
          <p className="relative mt-4 text-[15px] text-white/55">Melde dich an und du bist in Sekunden in deinem Arbeitsbereich.</p>
          <div className="relative mt-8 flex w-full max-w-sm flex-col items-center gap-3">{signIn}</div>
        </motion.div>
      </section>

      <div className="relative flex justify-center border-t border-white/[0.06] pt-8">
        <PublicLegalFooter dark />
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <IconRobot className="size-5" />,
    title: "Ein Team aus Agenten",
    text: "Jeder Agent mit eigenem Modell, eigenen Verbindern und eigener Rolle. Du chattest, sie arbeiten.",
  },
  {
    icon: <IconBuildingSkyscraper className="size-5" />,
    title: "Unternehmen & Projekte",
    text: "Mehrere Firmen, jede mit eigenem Logo, Gruppen und Agenten. Ein Klick wechselt alles.",
  },
  {
    icon: <IconWorldWww className="size-5" />,
    title: "Eigener Browser pro Agent",
    text: "Agenten arbeiten in ihrem eigenen Helium-Fenster mit eigenem Profil. Du siehst live mit.",
  },
  {
    icon: <IconDeviceLaptop className="size-5" />,
    title: "Connect Notch",
    text: "Timer, Anrufe mit Agenten und das Auftrag-Menü mit Ctrl+Alt+K, überall in Windows.",
  },
  {
    icon: <IconBrain className="size-5" />,
    title: "Brain",
    text: "Dein Obsidian-Wissen als Graph. Pro Agent und Projekt einstellbar, was er lesen darf.",
  },
  {
    icon: <IconDeviceMobile className="size-5" />,
    title: "PC und Handy",
    text: "Die gleiche App auf dem Handy, mit Wischen zwischen Fokus, Chats, Browser und Firmen.",
  },
];

const STEPS = [
  { title: "Mit Google anmelden", text: "Ein Klick, kein Passwort. Dein Konto ist sofort eingerichtet." },
  { title: "Firma und Agenten anlegen", text: "Logo, Gruppen und Agenten. Jeder bekommt sein Modell und seine Werkzeuge." },
  { title: "Aufträge geben", text: "Im Chat, per Anruf über die Notch oder mit Ctrl+Alt+K direkt aus jeder App." },
];

/** Nachgebaute App-Ansicht (kein Screenshot), damit sie scharf und leicht bleibt. */
function AppPreview() {
  const agents = [
    { name: "Connect", line: "Preview ist online.", time: "12:41", tint: "#ec4899" },
    { name: "SEO-Agent", line: "Keyword-Liste ist fertig.", time: "11:02", tint: "#22c55e" },
    { name: "Analysis", line: "Wobei soll ich dir helfen?", time: "Gestern", tint: "#ef4444" },
    { name: "Design", line: "Drei Entwürfe im Ordner.", time: "Do", tint: "#a78bfa" },
  ];
  return (
    <div className="cxl-window">
      <div className="cxl-window-bar">
        <span /> <span /> <span />
        <div className="cxl-window-url">localhost:3101 · Connect</div>
      </div>
      <div className="grid grid-cols-[260px_1fr] max-md:grid-cols-1">
        <aside className="border-r border-white/[0.06] p-4 max-md:hidden">
          <div className="flex gap-3">
            {["#38bdf8", "#ec4899", "#ef4444"].map((c) => (
              <div className="flex flex-col items-center gap-1.5" key={c}>
                <div className="size-12 rounded-2xl" style={{ background: `linear-gradient(135deg, ${c}, ${c}88)` }} />
              </div>
            ))}
          </div>
          <p className="mt-6 text-[10px] font-semibold tracking-[0.14em] text-white/30">AGENTEN</p>
          <div className="mt-2 flex flex-col gap-1">
            {agents.map((a, i) => (
              <div className={`flex items-center gap-3 rounded-xl px-2 py-2 ${i === 0 ? "bg-white/[0.06] ring-1 ring-white/[0.06]" : ""}`} key={a.name}>
                <div className="size-8 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, ${a.tint}, ${a.tint}55)` }} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-white/90">{a.name}</span>
                    <span className="text-[10px] text-white/30">{a.time}</span>
                  </div>
                  <p className="truncate text-[11px] text-white/40">{a.line}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="relative flex min-h-[360px] flex-col p-6">
          <div className="mx-auto mb-6 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/80">
            <span className="size-4 rounded-full bg-pink-500" /> Connect (Software)
          </div>
          <div className="flex flex-col gap-3 text-left text-[13px]">
            <div className="max-w-[70%] self-end rounded-[20px] rounded-br-md border border-white/[0.07] bg-[#1f1f24] px-4 py-2.5 text-white/90">
              Bau mir die Landingpage im Premium-Look und stell sie online.
            </div>
            <div className="max-w-[78%] self-start rounded-[20px] rounded-bl-md bg-white/[0.04] px-4 py-2.5 text-white/75">
              Erledigt. Die Vorschau ist live, Screenshots liegen im Chat. Soll ich sie in die Produktion übernehmen?
            </div>
            <div className="flex items-center gap-2 self-start text-[12px] text-white/35">
              <span className="cxl-typing"><i /><i /><i /></span> Connect arbeitet
            </div>
          </div>
          <div className="mt-auto flex items-center gap-3 rounded-3xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 shadow-[0_20px_50px_-20px_rgba(56,189,248,0.25)]">
            <span className="text-[13px] text-white/30">Frag deine Agenten …</span>
            <span className="ml-auto flex size-8 items-center justify-center rounded-full bg-white text-black">
              <IconArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
