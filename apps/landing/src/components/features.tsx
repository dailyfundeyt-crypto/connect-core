"use client";

import { motion } from "framer-motion";
import {
  Bot as BotIcon,
  Monitor,
  ShieldCheck,
  Globe2,
  FolderTree,
  Zap,
  Users,
  Database,
  Code2,
} from "lucide-react";
import { GitHubStats } from "@/components/github-stats";

const features = [
  {
    icon: BotIcon,
    title: "AI Agents as Coworkers",
    desc: "Give each agent a role, a brain (your model of choice), and let them work in parallel. Agents see your browser, your files, your data.",
  },
  {
    icon: Monitor,
    title: "Real Browser for Every Agent",
    desc: "Each agent gets its own isolated Chromium container with a persistent workspace. Agents log into sites, scrape pages, fill forms.",
  },
  {
    icon: Globe2,
    title: "Integrated Browser for You",
    desc: "The same browser you use daily — but with an AI assistant sidebar. Open Comet-style actions, pin pages to folders.",
  },
  {
    icon: FolderTree,
    title: "Company & Project Folders",
    desc: "Organise sites into folders — Technische, Fundamentals, Build, AI or any custom group. Agents know where to look.",
  },
  {
    icon: ShieldCheck,
    title: "Your Data, Your Servers",
    desc: "Self-host on your own infrastructure. Every action is CEL-policy-gated and audited. Nothing leaves your PostgreSQL.",
  },
  {
    icon: Database,
    title: "Full Context in Every Chat",
    desc: "Connect pulls in page context, selected text, active tab history and agent memory. No copy-paste. No context switching.",
  },
  {
    icon: Zap,
    title: "Routines & Automations",
    desc: "Define trigger → action flows that fire on a schedule or from a chat prompt. All running in isolated containers.",
  },
  {
    icon: Users,
    title: "Team-Ready from Day One",
    desc: "Role-based access, company workspaces, shared folders, and MCP connectors for Slack, GitHub, Linear and more.",
  },
  {
    icon: Code2,
    title: "Any Model, Any Endpoint",
    desc: "OpenAI, Anthropic, Google, Ollama, Azure — or any OpenAI-compatible API. Mix and match per agent.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="relative overflow-hidden py-32 sm:py-40"
    >
      {/* subtle gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-sky-50/30 to-white dark:from-ink-900 dark:via-sky-950/20 dark:to-ink-900" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Section header — clean, spacious */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-20 text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
            Everything you need
          </p>
          <h2 className="hand-text text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
            Built different, by default
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-400 dark:text-cream-100/50">
            Connect isn't another SaaS AI wrapper. It's the actual workspace — with the
            browser, the agents, the policies, and your data all in one place.
          </p>
        </motion.div>

        {/* Feature grid — clean card grid */}
        <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="group"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-900/10 bg-white shadow-sm dark:border-cream-50/10 dark:bg-ink-800">
                  <Icon className="h-5 w-5 text-sky-600 dark:text-sky-400" strokeWidth={1.8} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-ink-900 dark:text-cream-50">
                  {f.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-ink-400 dark:text-cream-100/55">
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Social proof strip — live GitHub data */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-3xl border border-ink-900/8 bg-white/80 px-10 py-7 shadow-sm backdrop-blur-sm dark:border-cream-50/8 dark:bg-ink-800/60"
        >
          <div className="text-xs text-ink-400 dark:text-cream-100/45">MIT License · 100% Self-hosted</div>
          <div className="h-4 w-px bg-ink-900/10 dark:bg-cream-50/10" />
          <p className="hand-text text-xl font-extrabold text-ink-900 dark:text-cream-50">
            MIT
          </p>
          <p className="text-xs text-ink-400 dark:text-cream-100/45">License</p>
          <div className="h-4 w-px bg-ink-900/10 dark:bg-cream-50/10" />
          <p className="hand-text text-xl font-extrabold text-ink-900 dark:text-cream-50">
            100%
          </p>
          <p className="text-xs text-ink-400 dark:text-cream-100/45">
            Self-hosted
          </p>
        </motion.div>
      </div>
    </section>
  );
}
