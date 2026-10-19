"use client";

import { ArrowUpRight, Github, MessageCircle, Twitter } from "lucide-react";

const actions = [
  {
    title: "Follow us on X",
    description: "Product updates and new releases.",
    href: "https://x.com/stefan_kunc",
    icon: Twitter,
    accent: "text-sky-500",
  },
  {
    title: "Star Connect on GitHub",
    description: "Follow development and support the project.",
    href: "https://github.com/dailyfundeyt-crypto/connect",
    icon: Github,
    accent: "text-violet-500",
  },
  {
    title: "Join us on Slack",
    description: "Meet other Connect users and get help.",
    href: process.env.NEXT_PUBLIC_CONNECT_SLACK_URL || "",
    icon: MessageCircle,
    accent: "text-indigo-500",
  },
];

export function CommunitySection() {
  return (
    <section className="relative py-20 sm:py-28" id="community">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-300">
            Connect community
          </p>
          <h2 className="hand-text mt-3 text-3xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-4xl">
            Build Connect with us
          </h2>
          <p className="mt-3 text-base text-ink-500 dark:text-cream-100/60">
            Follow the project, support open source, and join the conversation.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {actions.map(({ title, description, href, icon: Icon, accent }) => (
            <a
              aria-disabled={!href || undefined}
              className={`group flex min-h-36 flex-col justify-between rounded-2xl border border-ink-900/10 bg-white/70 p-5 transition dark:border-cream-50/10 dark:bg-ink-800/50 ${href ? "hover:-translate-y-0.5 hover:border-sky-400/50 hover:shadow-lg" : "cursor-not-allowed opacity-60"}`}
              href={href || undefined}
              key={title}
              rel={href ? "noopener noreferrer" : undefined}
              target={href ? "_blank" : undefined}
            >
              <div className="flex items-start justify-between">
                <span className={`rounded-xl bg-ink-900/5 p-2.5 dark:bg-cream-50/5 ${accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {href ? (
                  <ArrowUpRight className="h-4 w-4 text-ink-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-500" />
                ) : (
                  <span className="text-xs text-ink-400 dark:text-cream-100/40">Link folgt</span>
                )}
              </div>
              <div className="mt-6">
                <h3 className="font-semibold text-ink-900 dark:text-cream-50">{title}</h3>
                <p className="mt-1 text-sm text-ink-500 dark:text-cream-100/55">{description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
