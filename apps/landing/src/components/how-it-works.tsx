"use client";

import { motion } from "framer-motion";
import { AnimatedAgent } from "@/components/animated-agent";

const steps = [
  {
    n: "01",
    title: "Deploy on your server",
    desc: "Run the Docker Compose on any machine with PostgreSQL. Connect starts in minutes. Your data never leaves your infrastructure.",
    detail: "bun run docker-compose up",
  },
  {
    n: "02",
    title: "Add your models",
    desc: "Connect to OpenAI, Anthropic, Google, Ollama, or any OpenAI-compatible endpoint. Assign different models to different agents.",
    detail: "OpenAI · Anthropic · Google · Ollama · Azure",
  },
  {
    n: "03",
    title: "Launch the browser",
    desc: "Open Connect Desktop or the web app. Leo greets you and walks you through creating your first agent — no forms, no config files.",
    detail: "Windows · macOS · Linux",
  },
  {
    n: "04",
    title: "Agents work, you review",
    desc: "Agents browse the web, read docs, fill forms and chat with you. Every action is logged. You stay in control at all times.",
    detail: "Real Chromium · Persistent workspace · Audit log",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      className="relative overflow-hidden py-28 sm:py-36"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/0 via-sky-50/40 to-sky-50/0 dark:from-sky-950/0 dark:via-sky-950/20 dark:to-sky-950/0" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-20 text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
            Getting started
          </p>
          <h2 className="hand-text text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
            Up in 4 steps
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-400 dark:text-cream-100/50">
            No credit card. No vendor lock-in. No PhD in infrastructure required.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="mx-auto max-w-4xl">
          {steps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative flex gap-8 py-8"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="absolute left-[27px] top-[88px] h-[calc(100%-56px)] w-px bg-gradient-to-b from-sky-300 to-transparent dark:from-sky-700" />
              )}

              {/* Number bubble */}
              <div className="relative flex-shrink-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-sky-200 bg-white shadow-sm dark:border-sky-800 dark:bg-ink-800">
                  <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">
                    {step.n}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-2">
                <h3 className="hand-text text-xl font-bold text-ink-900 dark:text-cream-50">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-400 dark:text-cream-100/55">
                  {step.desc}
                </p>
                <code className="mt-3 inline-block rounded-lg border border-ink-900/8 bg-ink-50 px-3 py-1.5 font-mono text-xs text-ink-500 dark:border-cream-50/10 dark:bg-ink-800 dark:text-cream-100/70">
                  {step.detail}
                </code>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bot illustration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-12 flex justify-center"
        >
          <div className="inline-flex items-center gap-4 rounded-2xl border border-ink-900/8 bg-white px-8 py-5 shadow-sm dark:border-cream-50/10 dark:bg-ink-800">
            <AnimatedAgent mood="waving" size={72} />
            <div className="text-left">
              <p className="text-sm font-semibold text-ink-700 dark:text-cream-100">
                Meet Leo
              </p>
              <p className="mt-1 text-xs text-ink-400 dark:text-cream-100/45">
                Your AI coworker — guides you through setup and stays in the chat
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
