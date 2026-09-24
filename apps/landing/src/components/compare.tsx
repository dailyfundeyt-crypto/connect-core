"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const rows = [
  { label: "Self-hosted", connect: true },
  { label: "Real Chromium browser", connect: true },
  { label: "AI agents built in", connect: true },
  { label: "Company & project folders", connect: true },
  { label: "Full audit log", connect: true },
  { label: "CEL policy gates", connect: true },
  { label: "Open source", connect: true },
  { label: "MIT license", connect: true },
];

const others = ["ChatGPT", "Claude.ai", "Perplexity", "Arc", "Copilot"];

export function Compare() {
  return (
    <section id="compare" className="py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
            Why Connect
          </p>
          <h2 className="hand-text text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
            Compare to the rest
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-400 dark:text-cream-100/50">
            Most AI tools are SaaS with a shiny UI. Connect is infrastructure you own —
            with agents that actually browse the web.
          </p>
        </motion.div>

        {/* Feature table */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ink-900/10 bg-white shadow-sm dark:border-cream-50/10 dark:bg-ink-800"
        >
          {/* Table header */}
          <div className="flex items-center border-b border-ink-900/8 bg-ink-50 px-6 py-4 dark:border-cream-50/8 dark:bg-ink-900">
            <div className="flex-1 text-xs font-semibold uppercase tracking-wider text-ink-400 dark:text-cream-100/50">
              Feature
            </div>
            <div className="flex items-center gap-2">
              <Image
                src="/img/connect-logo.png"
                alt="Connect"
                width={20}
                height={20}
                className="h-5 w-5 rounded-full dark:invert"
              />
              <span className="text-xs font-semibold text-ink-700 dark:text-cream-100">
                Connect
              </span>
            </div>
            <div className="ml-12 w-24 text-right text-xs font-semibold text-ink-400 dark:text-cream-100/40">
              Others
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center px-6 py-4 ${
                i < rows.length - 1
                  ? "border-b border-ink-900/6 dark:border-cream-50/6"
                  : ""
              }`}
            >
              <div className="flex-1 text-sm font-medium text-ink-700 dark:text-cream-100">
                {row.label}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  ✓
                </span>
                <span className="text-xs text-ink-400 dark:text-cream-100/40">—</span>
              </div>
              <div className="ml-12 w-24 text-right">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  ✗
                </span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Products */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {others.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-xl border border-ink-900/10 bg-white px-4 py-3 text-center dark:border-cream-50/10 dark:bg-ink-800"
            >
              <p className="text-xs font-semibold text-ink-500 dark:text-cream-100/60">
                {name}
              </p>
              <p className="mt-0.5 text-[10px] text-rose-400">SaaS only</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
