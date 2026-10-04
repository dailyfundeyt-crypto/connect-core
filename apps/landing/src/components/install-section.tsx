"use client";

import { motion } from "framer-motion";
import { ExternalLink, Smartphone, Monitor, Globe2, Chrome } from "lucide-react";
import Image from "next/image";

/** Installation platforms — each row is a product line with platform variants. */
const installGroups = [
  {
    name: "Helium",
    tagline: "Browser-Extension",
    taglineDe: "Browser-Erweiterung",
    desc: "Install Helium as a Chrome or Edge extension. It opens a Connect sidebar and proxies browser commands from Connect agents.",
    descDe: "Helium als Chrome- oder Edge-Erweiterung installieren. Es öffnet eine Connect-Sidebar und leitet Browser-Befehle von Connect-Agents weiter.",
    icon: Chrome,
    color: "from-sky-500 to-blue-600",
    colorDark: "from-sky-400 to-blue-500",
    badge: "NEW",
    badgeColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    platforms: [
      {
        label: "Chrome",
        sub: "Chrome Web Store",
        href: "#",
        icon: Chrome,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
      {
        label: "Edge",
        sub: "Edge Add-ons",
        href: "#",
        icon: Globe2,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
    ],
  },
  {
    name: "Connect Mobile",
    tagline: "iOS & Android",
    taglineDe: "iOS & Android",
    desc: "Chat with your agents on the go. The mobile app mirrors your Connect workspace so Leo and your agents are always at hand.",
    descDe: "Mit deinen Agents unterwegs chatten. Die Mobile-App spiegelt deinen Connect-Arbeitsbereich, damit Leo und deine Agents immer griffbereit sind.",
    icon: Smartphone,
    color: "from-violet-500 to-purple-600",
    colorDark: "from-violet-400 to-purple-500",
    badge: null,
    badgeColor: "",
    platforms: [
      {
        label: "iOS",
        sub: "App Store",
        href: "#",
        icon: Smartphone,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
      {
        label: "Android",
        sub: "Google Play",
        href: "#",
        icon: Smartphone,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
    ],
  },
  {
    name: "Connect Desktop",
    tagline: "Windows · macOS · Linux",
    taglineDe: "Windows · macOS · Linux",
    desc: "A full desktop app with a real Chromium instance per agent. Best performance, local model support, and a native system tray.",
    descDe: "Eine vollständige Desktop-App mit einer echten Chromium-Instanz pro Agent. Beste Performance, lokale Modell-Unterstützung und ein nativer System-Tray.",
    icon: Monitor,
    color: "from-amber-500 to-orange-600",
    colorDark: "from-amber-400 to-orange-500",
    badge: null,
    badgeColor: "",
    platforms: [
      {
        label: "Windows",
        sub: ".exe (WPF/Electron)",
        href: "#",
        icon: Monitor,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
      {
        label: "macOS",
        sub: "DMG (Apple Silicon + Intel)",
        href: "#",
        icon: Monitor,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
      {
        label: "Linux",
        sub: "AppImage / .deb",
        href: "#",
        icon: Monitor,
        badge: "Bald verfügbar",
        badgeType: "muted" as const,
      },
    ],
  },
  {
    name: "Connect Web",
    tagline: "Browser — no install",
    taglineDe: "Browser — ohne Installation",
    desc: "Open Connect directly in your browser. Works on any device. Self-hosted or use the hosted version.",
    descDe: "Connect direkt im Browser öffnen. Funktioniert auf jedem Gerät. Self-hosted oder die gehostete Version nutzen.",
    icon: Globe2,
    color: "from-emerald-500 to-teal-600",
    colorDark: "from-emerald-400 to-teal-500",
    badge: null,
    badgeColor: "",
    platforms: [
      {
        label: "Web App",
        sub: "Jetzt öffnen →",
        href: "/app",
        icon: Globe2,
        badge: "Connect öffnen",
        badgeType: "primary" as const,
      },
    ],
  },
];

export function InstallSection() {
  return (
    <section id="install" className="relative overflow-hidden py-28 sm:py-36">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-sky-50/20 to-white dark:from-ink-900 dark:via-sky-950/20 dark:to-ink-900" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
            Download
          </p>
          <h2 className="hand-text text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
            Get Connect on any device
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-400 dark:text-cream-100/50">
            Browser extension, mobile app, or desktop — choose what fits your workflow.
            <br className="hidden sm:block" />
            All editions sync via your own self-hosted server.
          </p>
        </motion.div>

        {/* Install groups — 2-column on desktop */}
        <div className="grid gap-8 lg:grid-cols-2">
          {installGroups.map((group, gi) => {
            const Icon = group.icon;
            return (
              <motion.div
                key={group.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: gi * 0.07 }}
                className="group relative overflow-hidden rounded-3xl border border-ink-900/10 bg-white shadow-sm dark:border-cream-50/10 dark:bg-ink-800"
              >
                {/* Colour accent strip */}
                <div
                  className={`h-1 w-full bg-gradient-to-r ${group.color} ${group.colorDark} dark:opacity-80`}
                />

                <div className="p-7">
                  {/* Product header */}
                  <div className="mb-5 flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${group.color} ${group.colorDark} shadow-sm`}
                    >
                      <Icon
                        className="h-6 w-6 text-white"
                        strokeWidth={1.8}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="hand-text text-xl font-extrabold text-ink-900 dark:text-cream-50">
                          {group.name}
                        </h3>
                        {group.badge && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${group.badgeColor}`}
                          >
                            {group.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-sky-500 dark:text-sky-400">
                        {group.tagline} · {group.taglineDe}
                      </p>
                    </div>
                  </div>

                  {/* Description — bilingual */}
                  <p className="mb-6 text-sm leading-relaxed text-ink-400 dark:text-cream-100/50">
                    {group.desc}
                  </p>

                  {/* Platform buttons */}
                  <div className="flex flex-wrap gap-3">
                    {group.platforms.map((platform) => {
                      const PlatformIcon = platform.icon;
                      return (
                        <a
                          key={platform.label}
                          href={platform.href}
                          className={`group/btn flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
                            platform.badgeType === "primary"
                              ? "border-sky-400/50 bg-sky-50 text-sky-700 hover:border-sky-500 hover:bg-sky-100 dark:border-sky-600/50 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:border-sky-500 dark:hover:bg-sky-950/60"
                              : "border-ink-900/8 bg-ink-50 text-ink-700 hover:border-ink-900/20 hover:bg-white dark:border-cream-50/10 dark:bg-ink-900 dark:text-cream-100 dark:hover:border-cream-50/25 dark:hover:bg-ink-700"
                          }`}
                        >
                          <PlatformIcon
                            className={`h-4 w-4 flex-shrink-0 ${
                              platform.badgeType === "primary"
                                ? "text-sky-500 dark:text-sky-400"
                                : "text-ink-400 dark:text-cream-100/40"
                            }`}
                            strokeWidth={1.8}
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold">{platform.label}</span>
                            <span
                              className={`block text-xs ${
                                platform.badgeType === "primary"
                                  ? "text-sky-500 dark:text-sky-400"
                                  : "text-ink-400 dark:text-cream-100/40"
                              }`}
                            >
                              {platform.sub}
                            </span>
                          </span>
                          {platform.badgeType === "muted" && (
                            <span className="ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-400 dark:bg-ink-700 dark:text-cream-100/40">
                              {platform.badge}
                            </span>
                          )}
                          {platform.badgeType === "primary" && (
                            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white">
                              <ExternalLink className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* "Open Connect" CTA — full-width bottom strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 flex flex-col items-center gap-5 rounded-3xl border border-ink-900/10 bg-gradient-to-r from-ink-900 to-ink-800 px-8 py-10 text-center shadow-lg dark:border-cream-50/10 dark:from-ink-800 dark:to-ink-700 sm:flex-row sm:text-left"
        >
          {/* Agent avatar */}
          <div className="flex-shrink-0">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-white/10 p-1.5 shadow-inner">
              <Image
                src="/img/connect-logo.png"
                alt="Connect"
                width={56}
                height={56}
                className="h-full w-full object-contain dark:invert"
              />
            </div>
          </div>

          <div className="flex-1">
            <p className="hand-text text-xl font-extrabold text-white">
              Already installed?
            </p>
            <p className="mt-1 text-sm text-white/60">
              Open Connect in your browser — no download required.
            </p>
          </div>

          <a
            href="/app"
            className="group flex items-center gap-2 rounded-full bg-sky-500 px-7 py-3.5 text-sm font-semibold text-ink-900 shadow-sm transition hover:bg-sky-400"
          >
            Connect öffnen →
            <ExternalLink className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </a>
        </motion.div>

        {/* Note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-8 text-center text-xs text-ink-400 dark:text-cream-100/40"
        >
          Alle Editionen verbinden sich mit deinem eigenen Server. Deine Daten verlassen deine Infrastruktur nicht.{" "}
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            100% self-hosted
          </span>
        </motion.p>
      </div>
    </section>
  );
}
