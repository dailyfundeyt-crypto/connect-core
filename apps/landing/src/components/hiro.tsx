"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowRight, Play, Github, Sparkles } from "lucide-react";
import { SingularityField } from "@/components/singularity-field";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white pt-32 pb-24 dark:bg-ink-900 sm:pt-40 sm:pb-32">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-sky-50/30 to-white dark:from-ink-900 dark:via-sky-950/10 dark:to-ink-900" />
        <div className="absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Headline — center aligned like Perplexity */}
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-900/10 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-ink-700 backdrop-blur-sm dark:border-cream-50/15 dark:bg-ink-800/80 dark:text-cream-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-500" />
            Self-hosted · Open source · MIT License
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="hand-text text-5xl font-extrabold leading-[1.05] tracking-tight text-ink-900 dark:text-cream-50 sm:text-6xl lg:text-[5.5rem]"
          >
            You were born at the{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 bg-clip-text text-transparent dark:from-orange-300 dark:via-amber-200 dark:to-orange-400">
                steep part
              </span>
            </span>{" "}
            of the curve.
            <br />
            <span className="text-ink-900 dark:text-cream-50">Pick the next step.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-400 dark:text-cream-100/55 sm:text-xl"
          >
            Connect is the open-source app for the years ahead — browsers, bots,
            folders and data all collapse into one self-hosted workspace you own.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <a
              href="#download"
              className="group inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-800 dark:bg-sky-500 dark:text-ink-900 dark:hover:bg-sky-400"
            >
              Get Connect — Free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
            <a
              href="#video"
              className="inline-flex items-center gap-2 rounded-full border border-ink-900/20 bg-white/80 px-6 py-3.5 text-sm font-semibold text-ink-700 backdrop-blur-sm transition hover:border-ink-900/40 hover:bg-white dark:border-cream-50/20 dark:bg-ink-800/60 dark:text-cream-100 dark:hover:border-cream-50/40 dark:hover:bg-ink-800"
            >
              <Play className="h-4 w-4 fill-current" />
              Watch the demo
            </a>
            <a
              href="https://github.com/dailyfundeyt-crypto/connect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-3.5 text-sm font-medium text-ink-400 transition hover:text-ink-700 dark:text-cream-100/50 dark:hover:text-cream-100"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </a>
          </motion.div>

          {/* Trust strip — live GitHub data */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10"
          >
            <div className="text-sm text-ink-400 dark:text-cream-100/45">
              MIT License · TypeScript · 100% Self-hosted
            </div>
          </motion.div>
        </div>

        {/* Hero visual — the Singularity: agents fall into Connect */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
          className="relative mx-auto mt-20 max-w-5xl"
        >
          <div className="relative rounded-3xl border border-ink-900/10 bg-gradient-to-b from-cream-50 to-white p-6 sm:p-10 dark:border-cream-50/10 dark:from-ink-900 dark:to-ink-900">
            <SingularityField />
            <div className="mt-4 text-center text-xs font-medium uppercase tracking-widest text-ink-400 dark:text-cream-100/45">
              Agents · Tasks · Data · falling inward
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Hero mockup — agent character alongside a browser preview, both real PNGs.
 * Designed to feel like Perplexity Comet's hero visual.
 */
function HeroMockup() {
  return (
    <div className="relative">
      {/* Browser window mockup */}
      <div className="overflow-hidden rounded-2xl border border-ink-900/10 bg-white shadow-[0_30px_80px_-20px_rgba(2,132,199,0.25),0_8px_30px_-10px_rgba(0,0,0,0.15)] dark:border-cream-50/15 dark:bg-ink-800">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-ink-900/8 bg-ink-50 px-4 py-2.5 dark:border-cream-50/10 dark:bg-ink-900">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-rose-400" />
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <div className="mx-auto flex h-6 w-72 items-center justify-center rounded-md bg-white px-3 text-[11px] text-ink-400 dark:bg-ink-800 dark:text-cream-100/45">
            connect.sh / workspace
          </div>
          <div className="w-12" />
        </div>

        {/* Browser content — two-pane workspace */}
        <div className="grid grid-cols-12 gap-0">
          {/* Left — sidebar */}
          <div className="col-span-3 border-r border-ink-900/8 bg-ink-50 p-3 dark:border-cream-50/10 dark:bg-ink-900">
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 dark:bg-ink-800">
              <Image
                src="/img/connect-logo.png"
                alt="Connect"
                width={20}
                height={20}
                className="dark:invert"
              />
              <span className="text-xs font-bold text-ink-900 dark:text-cream-50">
                Connect
              </span>
            </div>
            <div className="space-y-0.5">
              {[
                { label: "Technische", icon: "📈", active: true },
                { label: "Fundamentals", icon: "📊" },
                { label: "Sentimentale", icon: "💬" },
                { label: "Sektorielle", icon: "🏭" },
                { label: "Build", icon: "🔨" },
                { label: "AI", icon: "✦" },
              ].map((folder) => (
                <div
                  key={folder.label}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${
                    folder.active
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                      : "text-ink-500 dark:text-cream-100/55"
                  }`}
                >
                  <span>{folder.icon}</span>
                  <span className="font-medium">{folder.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — browser */}
          <div className="col-span-9 p-4">
            {/* Agent tab bar */}
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-800/60 dark:bg-sky-950/30">
              <Image
                src="/img/agent-character.png"
                alt="Agent"
                width={20}
                height={20}
                className="rounded-full"
              />
              <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
                Agent · analysing{" "}
                <span className="font-mono">tradingview.com</span>
              </span>
              <div className="ml-auto h-2 w-2 animate-pulse rounded-full bg-sky-500" />
            </div>

            {/* Search bar */}
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-ink-900/10 bg-white px-3 py-2 dark:border-cream-50/10 dark:bg-ink-800">
              <Image
                src="/img/connect-logo.png"
                alt=""
                width={16}
                height={16}
                className="dark:invert"
              />
              <span className="text-xs text-ink-400 dark:text-cream-100/50">
                Ask Leo anything…
              </span>
            </div>

            {/* Floating agent response preview */}
            <div className="rounded-xl border border-ink-900/8 bg-ink-50 p-3 dark:border-cream-50/10 dark:bg-ink-800/60">
              <div className="mb-2 flex items-center gap-2">
                <Image
                  src="/img/agent-character.png"
                  alt=""
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                <span className="text-[11px] font-semibold text-ink-700 dark:text-cream-100">
                  Leo · 2s ago
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink-500 dark:text-cream-100/60">
                I analysed the page and pinned 3 charts to your{" "}
                <span className="rounded bg-sky-100 px-1 font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  Technische
                </span>{" "}
                folder.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating agent character — peeking from corner */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-12 -left-6 hidden h-32 w-32 rounded-full bg-white p-2 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)] ring-1 ring-ink-900/10 dark:bg-ink-800 dark:ring-cream-50/15 sm:block"
      >
        <Image
          src="/img/agent-character.png"
          alt="Agent"
          width={128}
          height={128}
          className="h-full w-full object-contain"
        />
      </motion.div>

      {/* "Live now" pill */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute -right-3 top-12 hidden rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 shadow-md sm:block dark:border-emerald-700 dark:bg-ink-800 dark:text-emerald-300"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />
        Agents running
      </motion.div>
    </div>
  );
}
