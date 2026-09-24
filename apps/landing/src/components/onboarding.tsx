"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Sparkles } from "lucide-react";

/**
 * Product demo section.
 * Plays through a 6-scene narrative showing what Connect does,
 * captured in a Perplexity-Computer style animated product surface.
 */
type Scene = {
  id: string;
  title: string;
  voiceover: string;
  duration: number; // ms
};

const scenes: Scene[] = [
  {
    id: "1",
    title: "Open Leo",
    voiceover:
      "Hi, I'm Leo — your AI coworker. Let's build your first agent together.",
    duration: 4000,
  },
  {
    id: "2",
    title: "Pick a model",
    voiceover:
      "Pick any model — Claude Opus 5.5, GPT-5, Llama 4, or your own Ollama at home. Swap anytime.",
    duration: 5000,
  },
  {
    id: "3",
    title: "Browse together",
    voiceover:
      "Leo opens the browser with you. He sees every page, every form, every chart.",
    duration: 4500,
  },
  {
    id: "4",
    title: "Pin to a folder",
    voiceover:
      "Save any page to one of your company folders — Technische, Fundamentals, or your own.",
    duration: 4500,
  },
  {
    id: "5",
    title: "Run an agent",
    voiceover:
      "Now Leo has a teammate — an agent that browses autonomously while you keep working.",
    duration: 4500,
  },
  {
    id: "6",
    title: "All yours",
    voiceover:
      "Every byte stays on your server. Every action is audited. Everything is yours.",
    duration: 4500,
  },
];

export function OnboardingVideo() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Auto-play loop
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setActive((a) => (a + 1) % scenes.length);
    }, scenes[active].duration);
    return () => clearTimeout(timer);
  }, [active, playing]);

  const reset = () => {
    setActive(0);
    setPlaying(true);
  };

  return (
    <section id="video" className="relative overflow-hidden py-28 sm:py-36">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-sky-50/20 to-white dark:from-ink-900 dark:via-sky-950/15 dark:to-ink-900" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-14 text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
            Product tour
          </p>
          <h2 className="hand-text text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
            See Connect in action
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-400 dark:text-cream-100/50">
            A 30-second walkthrough of how Leo and your agents work together.
          </p>
        </motion.div>

        {/* Demo stage */}
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl border border-ink-900/10 bg-white shadow-[0_30px_80px_-20px_rgba(2,132,199,0.25)] dark:border-cream-50/15 dark:bg-ink-800">
            {/* Video canvas */}
            <div className="relative aspect-video bg-gradient-to-br from-sky-100 via-white to-violet-100 dark:from-ink-900 dark:via-ink-900 dark:to-ink-800">
              {/* Scene 1: Open Leo */}
              {active === 0 && <SceneOpenLeo />}
              {/* Scene 2: Pick model */}
              {active === 1 && <ScenePickModel />}
              {/* Scene 3: Browse */}
              {active === 2 && <SceneBrowse />}
              {/* Scene 4: Pin folder */}
              {active === 3 && <ScenePinFolder />}
              {/* Scene 5: Run agent */}
              {active === 4 && <SceneRunAgent />}
              {/* Scene 6: All yours */}
              {active === 5 && <SceneAllYours />}

              {/* Watermark / live indicator */}
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-sky-700 backdrop-blur-sm dark:border-sky-700 dark:bg-ink-900/80 dark:text-sky-300">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                LIVE DEMO
              </div>

              {/* Subtitles */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-6">
                <p className="mx-auto max-w-2xl text-center text-base font-medium text-white sm:text-lg">
                  {scenes[active].voiceover}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 border-t border-ink-900/8 bg-ink-50 px-5 py-3.5 dark:border-cream-50/10 dark:bg-ink-900">
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-white transition hover:bg-ink-700 dark:bg-sky-500 dark:text-ink-900 dark:hover:bg-sky-400"
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
              </button>

              {/* Progress */}
              <div className="flex flex-1 gap-1">
                {scenes.map((s, i) => {
                  const isActive = i === active;
                  const isPast = i < active;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActive(i);
                        setPlaying(true);
                      }}
                      aria-label={`Go to scene ${s.id}`}
                      className="group flex h-1.5 flex-1 items-center"
                    >
                      <span
                        className={`h-full w-full rounded-full transition-all ${
                          isActive
                            ? "bg-sky-500"
                            : isPast
                            ? "bg-sky-500/50"
                            : "bg-ink-200 dark:bg-cream-50/20"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <button
                onClick={reset}
                aria-label="Replay"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-900/10 text-ink-500 transition hover:bg-white dark:border-cream-50/15 dark:text-cream-100/60 dark:hover:bg-ink-800"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            {/* Scene titles under the bar */}
            <div className="border-t border-ink-900/8 px-5 py-3 dark:border-cream-50/10">
              <p className="text-[11px] font-semibold text-ink-400 dark:text-cream-100/45">
                Scene {scenes[active].id} / {scenes.length} ·{" "}
                <span className="text-ink-700 dark:text-cream-100">
                  {scenes[active].title}
                </span>
              </p>
            </div>
          </div>

          {/* Trust note under the video */}
          <p className="mt-6 text-center text-sm text-ink-400 dark:text-cream-100/45">
            No fake localhost trick. Every action runs in your browser and on your
            server.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============== Scene components ============== */

function SceneOpenLeo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="mb-6 h-32 w-32 rounded-3xl bg-white p-3 shadow-2xl dark:bg-ink-700"
        >
          <Image
            src="/img/agent-character.png"
            alt="Leo"
            width={128}
            height={128}
            className="h-full w-full object-contain"
          />
        </motion.div>
        <motion.p
          key="hi"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hand-text text-2xl font-bold text-ink-900 dark:text-cream-50"
        >
          Hi, I'm Leo
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-1 text-sm text-ink-500 dark:text-cream-100/55"
        >
          your AI coworker
        </motion.p>
      </motion.div>
    </div>
  );
}

function ScenePickModel() {
  const models = [
    { name: "Claude Opus 5.5", color: "from-orange-500 to-amber-500", selected: true },
    { name: "GPT-5", color: "from-emerald-500 to-teal-500" },
    { name: "Llama 4 405B", color: "from-violet-500 to-purple-500" },
    { name: "Ollama (local)", color: "from-sky-500 to-blue-500" },
    { name: "Gemini 2.5 Pro", color: "from-rose-500 to-pink-500" },
    { name: "Mistral Large 3", color: "from-indigo-500 to-blue-500" },
    { name: "Qwen 3 72B", color: "from-fuchsia-500 to-rose-500" },
    { name: "Any OpenAI API", color: "from-slate-500 to-zinc-500" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
      <p className="mb-5 text-sm font-semibold text-ink-500 dark:text-cream-100/60">
        Choose your model · swap any time
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {models.map((m, i) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`relative rounded-xl border-2 p-2.5 backdrop-blur-sm ${
              m.selected
                ? "border-sky-500 bg-white shadow-lg dark:bg-ink-700"
                : "border-ink-900/10 bg-white/80 dark:border-cream-50/10 dark:bg-ink-800/80"
            }`}
          >
            <div
              className={`mb-1.5 h-7 w-7 rounded-lg bg-gradient-to-br ${m.color}`}
            />
            <p className="text-[11px] font-semibold text-ink-900 dark:text-cream-50">
              {m.name}
            </p>
            {m.selected && (
              <p className="mt-0.5 text-[9px] font-medium text-sky-600 dark:text-sky-300">
                ✓ Selected
              </p>
            )}
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-ink-400 dark:text-cream-100/40">
        + any OpenAI-compatible endpoint
      </p>
    </div>
  );
}

function SceneBrowse() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Chrome-style browser mockup */}
      <div className="absolute left-1/2 top-1/2 w-[80%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-ink-900/10 bg-white shadow-2xl dark:border-cream-50/10 dark:bg-ink-800">
        <div className="flex items-center gap-1.5 border-b border-ink-900/8 px-3 py-2 dark:border-cream-50/10">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-rose-400" />
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="mx-2 flex-1 rounded bg-ink-50 px-2 py-0.5 text-[10px] text-ink-400 dark:bg-ink-900 dark:text-cream-100/40">
            tradingview.com
          </div>
        </div>
        {/* fake chart */}
        <div className="relative p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-ink-900 dark:text-cream-50">
              $87,420
            </span>
            <span className="text-[10px] text-emerald-500">+2.4%</span>
          </div>
          {/* animated price chart */}
          <svg viewBox="0 0 300 80" className="h-16 w-full">
            <motion.path
              d="M0 60 L40 50 L80 55 L120 35 L160 40 L200 20 L240 25 L300 10"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2 }}
            />
          </svg>
        </div>
      </div>
      {/* Leo watching */}
      <motion.div
        animate={{ x: [0, 4, 0], y: [0, -4, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-6 right-6 h-16 w-16 rounded-2xl bg-white p-1.5 shadow-xl ring-2 ring-sky-300 dark:bg-ink-700"
      >
        <Image
          src="/img/agent-character.png"
          alt=""
          width={64}
          height={64}
          className="h-full w-full object-contain"
        />
      </motion.div>
    </div>
  );
}

function ScenePinFolder() {
  const folders = [
    { label: "Technische", color: "bg-sky-500", pinned: true },
    { label: "Fundamentals", color: "bg-emerald-500" },
    { label: "Sentimentale", color: "bg-rose-500" },
    { label: "Build", color: "bg-violet-500" },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="flex w-full max-w-md items-center gap-6">
        {/* Page being pinned */}
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex-1 rounded-xl border border-ink-900/10 bg-white p-3 shadow-lg dark:border-cream-50/10 dark:bg-ink-800"
        >
          <div className="mb-2 h-3 w-16 rounded bg-ink-200 dark:bg-ink-700" />
          <div className="mb-1 h-2 w-24 rounded bg-ink-100 dark:bg-ink-700" />
          <div className="h-2 w-20 rounded bg-ink-100 dark:bg-ink-700" />
          <p className="mt-2 text-[10px] font-mono text-sky-500">
            tradingview.com/chart
          </p>
        </motion.div>

        {/* Arrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center text-ink-300 dark:text-cream-100/30"
        >
          →
        </motion.div>

        {/* Folders */}
        <div className="flex-1 space-y-2">
          {folders.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.12 }}
              className={`flex items-center gap-2 rounded-lg p-2 ${
                f.pinned
                  ? "bg-sky-50 ring-2 ring-sky-400 dark:bg-sky-950/60"
                  : "bg-white dark:bg-ink-800"
              }`}
            >
              <div className={`h-5 w-5 rounded ${f.color}`} />
              <span className="text-xs font-medium text-ink-700 dark:text-cream-100">
                {f.label}
              </span>
              {f.pinned && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.2, type: "spring" }}
                  className="ml-auto text-[10px] text-sky-600 dark:text-sky-300"
                >
                  ✓ Pinned
                </motion.span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneRunAgent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="flex w-full max-w-md items-end justify-around">
        {/* The human */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <div className="h-20 w-20 rounded-full bg-ink-200 p-2 dark:bg-ink-700">
            <Image
              src="/img/agent-character.png"
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-700 dark:text-cream-100">
            You
          </p>
        </motion.div>

        {/* Working arrows */}
        <div className="flex flex-col items-center gap-3">
          {["research", "fill form", "scrape"].map((t, i) => (
            <motion.div
              key={t}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.2 }}
              className="rounded-full border border-sky-300 bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-sky-700 backdrop-blur-sm dark:border-sky-700 dark:bg-ink-800/80 dark:text-sky-300"
            >
              {t}
            </motion.div>
          ))}
        </div>

        {/* The agent teammates */}
        {[
          { label: "Scout", color: "bg-emerald-500", delay: 0 },
          { label: "Coder", color: "bg-violet-500", delay: 0.2 },
        ].map((agent) => (
          <motion.div
            key={agent.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: agent.delay }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={{ rotate: [0, 4, -4, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: agent.delay,
              }}
              className={`h-16 w-16 rounded-2xl ${agent.color} p-2 shadow-lg`}
            >
              <Image
                src="/img/agent-character.png"
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-contain"
              />
            </motion.div>
            <p className="mt-2 text-xs font-semibold text-ink-700 dark:text-cream-100">
              {agent.label}
            </p>
            <p className="mt-0.5 text-[10px] text-emerald-500">● running</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SceneAllYours() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="grid w-full max-w-md grid-cols-3 gap-3">
        {[
          { label: "Self-hosted", icon: "🏠" },
          { label: "Audited", icon: "🛡️" },
          { label: "Open source", icon: "🔓" },
          { label: "Your data", icon: "💾" },
          { label: "Your agents", icon: "🤖" },
          { label: "Your browser", icon: "🌐" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className="flex flex-col items-center rounded-xl border border-ink-900/10 bg-white/85 p-3 backdrop-blur-sm dark:border-cream-50/10 dark:bg-ink-800/85"
          >
            <span className="mb-1 text-2xl">{s.icon}</span>
            <span className="text-[11px] font-semibold text-ink-700 dark:text-cream-100">
              {s.label}
            </span>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center"
      >
        <p className="hand-text text-xl font-bold text-ink-900 dark:text-cream-50">
          All yours. ✦
        </p>
      </motion.div>
    </div>
  );
}
