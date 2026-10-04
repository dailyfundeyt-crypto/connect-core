"use client";

import Image from "next/image";
import { Github, Twitter, Linkedin } from "lucide-react";

const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Install", href: "#install" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "GitHub", href: "https://github.com/dailyfundeyt-crypto/connect" },
      { label: "Documentation", href: "https://github.com/dailyfundeyt-crypto/connect#readme" },
      { label: "Docker Compose", href: "#how" },
      { label: "API Reference", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-900/10 bg-cream-50 dark:border-cream-50/10 dark:bg-ink-900">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <Image
                src="/img/connect-logo.png"
                alt="Connect"
                width={28}
                height={28}
                className="h-7 w-7 dark:invert"
              />
              <span className="hand-text text-base font-extrabold text-ink-900 dark:text-cream-50">
                Connect
              </span>
            </div>
            <p className="max-w-xs text-sm text-ink-400 dark:text-cream-100/50">
              The self-hosted AI coworker workspace. Run it on your servers. Own your
              data. Give your team AI agents that actually browse the web.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://github.com/dailyfundeyt-crypto/connect"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/50 dark:hover:bg-cream-50/10 dark:hover:text-cream-50"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/50 dark:hover:bg-cream-50/10 dark:hover:text-cream-50"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/50 dark:hover:bg-cream-50/10 dark:hover:text-cream-50"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          {footerLinks.map((col) => (
            <div key={col.heading}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400 dark:text-cream-100/50">
                {col.heading}
              </p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-ink-500 transition hover:text-ink-900 dark:text-cream-100/60 dark:hover:text-cream-50"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink-900/10 pt-8 text-xs text-ink-400 dark:border-cream-50/10 sm:flex-row">
          <p>
            © 2026 Connect. MIT License. Built with love for people who own their
            infrastructure.
          </p>
          <p className="flex items-center gap-1">
            Made with{" "}
            <span className="inline-block text-rose-400">♥</span> by the Connect
            community
          </p>
        </div>
      </div>
    </footer>
  );
}
