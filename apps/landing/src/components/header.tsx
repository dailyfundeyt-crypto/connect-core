"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun, Github, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const nav = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#onboarding", label: "Onboarding" },
  { href: "#compare", label: "Compare" },
  { href: "#download", label: "Download" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("connect-theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled
          ? "border-b border-ink-900/10 bg-cream-50/85 backdrop-blur-md dark:border-cream-50/10 dark:bg-ink-900/80"
          : "border-b border-transparent"
      }`}
    >
      <div
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/img/connect-logo.png"
            alt="Connect"
            width={32}
            height={32}
            className="h-7 w-7 dark:invert"
            priority
          />
          <span className="hand-text text-lg font-extrabold tracking-tight text-ink-900 dark:text-cream-50">
            Connect
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/70 dark:hover:bg-cream-50/10 dark:hover:text-cream-50"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full p-2 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/70 dark:hover:bg-cream-50/10 dark:hover:text-cream-50"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <a
            href="https://github.com/dailyfundeyt-crypto/connect"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hidden rounded-full p-2 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-900 dark:text-cream-100/70 dark:hover:bg-cream-50/10 dark:hover:text-cream-50 sm:block"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="#download"
            className="hidden rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink-700 dark:bg-cream-50 dark:text-ink-900 dark:hover:bg-cream-100 sm:block"
          >
            Get Connect
          </a>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            className="rounded-full p-2 text-ink-500 transition hover:bg-ink-900/5 md:hidden dark:hover:bg-cream-50/10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border-t border-ink-900/10 bg-cream-50 px-5 py-4 md:hidden dark:border-cream-50/10 dark:bg-ink-900"
          >
            <nav className="flex flex-col gap-1">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-900/5 dark:text-cream-100 dark:hover:bg-cream-50/10"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#download"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-xl bg-ink-900 px-3 py-2 text-center text-sm font-medium text-cream-50 dark:bg-cream-50 dark:text-ink-900"
              >
                Get Connect
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
