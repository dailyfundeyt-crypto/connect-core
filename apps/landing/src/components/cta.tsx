"use client";

import { motion } from "framer-motion";
import { AnimatedAgent } from "@/components/animated-agent";
import { Github, Download, ArrowRight, Sparkles } from "lucide-react";

export function Cta() {
  return (
    <section id="download" className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-cream-50 via-sky-50/30 to-cream-50 dark:from-ink-900 dark:via-sky-950/30 dark:to-ink-900" />

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center justify-center"
        >
          <AnimatedAgent mood="celebrating" size={160} />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="hand-text mt-6 text-5xl font-extrabold tracking-tight sm:text-6xl"
        >
          Ready to meet Leo?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-5 text-lg text-ink-500 dark:text-cream-100/60"
        >
          Connect is free, open source, and runs on your own hardware.
          <br />
          Leo is waiting to help you get started.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="https://github.com/dailyfundeyt-crypto/connect"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3.5 text-sm font-semibold text-cream-50 shadow-sm transition hover:bg-ink-700 dark:bg-sky-500 dark:text-ink-900 dark:hover:bg-sky-400"
          >
            <Github className="h-4 w-4" />
            Star on GitHub
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </a>
          <a
            href="#"
            className="group inline-flex items-center gap-2 rounded-full border-2 border-ink-900 px-6 py-3.5 text-sm font-semibold text-ink-700 transition hover:border-ink-900/70 hover:bg-cream-50 dark:border-cream-50/40 dark:text-cream-50 dark:hover:bg-ink-800"
          >
            <Download className="h-4 w-4" />
            Download for Windows
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          <Sparkles className="h-3 w-3" />
          Free · Open Source · MIT License
        </motion.div>
      </div>
    </section>
  );
}
