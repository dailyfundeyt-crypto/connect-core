"use client";

import { useEffect, useState } from "react";
import { Star, GitFork, Eye } from "lucide-react";
import { cn } from "@/lib/cn";

type RepoStats = {
  stars: number;
  forks: number;
  watchers: number;
  url: string;
  fullName: string;
  description: string;
  language: string | null;
  license: string | null;
  pushedAt: string;
};

type GitHubStatsProps = {
  /** owner/repo, e.g. "dailyfundeyt-crypto/connect" */
  repo?: string;
  /** Optional className wrapper */
  className?: string;
  /** "compact" for hero pill, "strip" for the trust strip */
  variant?: "compact" | "strip" | "footer";
  /** Which stats to show (default 3) */
  fields?: Array<"stars" | "forks" | "watchers">;
};

/**
 * Fetches live GitHub repo stats with a 15-minute in-memory cache. Falls back
 * to a hardcoded snapshot if the API is unreachable so we never show zeros
 * that look like a bug.
 */

const FALLBACK: RepoStats = {
  stars: 0,
  forks: 0,
  watchers: 0,
  url: "https://github.com/dailyfundeyt-crypto/connect",
  fullName: "dailyfundeyt-crypto/connect",
  description:
    "Self-hosted AI coworker workspace — real browser, real agents, full data ownership.",
  language: "TypeScript",
  license: "MIT",
  pushedAt: new Date().toISOString(),
};

let cache: { repo: string; data: RepoStats; ts: number } | null = null;
const TTL_MS = 1000 * 60 * 15;

async function fetchStats(repo: string): Promise<RepoStats> {
  if (cache && cache.repo === repo && Date.now() - cache.ts < TTL_MS) {
    return cache.data;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GH ${res.status}`);
    const json = await res.json();
    const data: RepoStats = {
      stars: json.stargazers_count ?? 0,
      forks: json.forks_count ?? 0,
      watchers: json.subscribers_count ?? 0,
      url: json.html_url ?? `https://github.com/${repo}`,
      fullName: json.full_name ?? repo,
      description: json.description ?? FALLBACK.description,
      language: json.language ?? null,
      license: json.license?.spdx_id ?? null,
      pushedAt: json.pushed_at ?? new Date().toISOString(),
    };
    cache = { repo, data, ts: Date.now() };
    return data;
  } catch {
    return FALLBACK;
  }
}

const fmt = (n: number): string => {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
};

export function GitHubStats({
  repo = "dailyfundeyt-crypto/connect",
  className,
  variant = "compact",
  fields = ["stars", "forks", "watchers"],
}: GitHubStatsProps) {
  const [stats, setStats] = useState<RepoStats>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetchStats(repo).then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // Compact: hero pill — only show if stars > 0, otherwise just show language + license
  if (variant === "compact") {
    const hasStars = stats.stars > 0;
    return (
      <a
        href={stats.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-ink-900/10 bg-white/80 px-3 py-1 text-xs font-semibold text-ink-700 backdrop-blur-sm transition hover:border-ink-900/20 dark:border-cream-50/15 dark:bg-ink-800/80 dark:text-cream-100",
          className,
        )}
      >
        {hasStars ? (
          <>
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span>{fmt(stats.stars)}</span>
            <span className="text-ink-400 dark:text-cream-100/45">on GitHub</span>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-ink-700 dark:text-cream-100">Open source</span>
            <span className="text-ink-400 dark:text-cream-100/45">· MIT</span>
            <span className="text-ink-400 dark:text-cream-100/45">· TypeScript</span>
          </>
        )}
      </a>
    );
  }

  // Strip: trust strip — show real numbers, hide fields with zero values
  if (variant === "strip") {
    const visibleFields = fields.filter((f) => {
      if (f === "stars") return stats.stars > 0;
      if (f === "forks") return stats.forks > 0;
      if (f === "watchers") return stats.watchers > 0;
      return false;
    });
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-400 dark:text-cream-100/45",
          className,
        )}
      >
        {visibleFields.includes("stars") && (
          <a
            href={`${stats.url}/stargazers`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition hover:text-ink-700 dark:hover:text-cream-100"
          >
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-ink-700 dark:text-cream-100">
              {fmt(stats.stars)}
            </span>
            <span>stars</span>
          </a>
        )}
        {visibleFields.length > 1 &&
          visibleFields.includes("stars") &&
          visibleFields.includes("forks") && (
            <span className="text-ink-200 dark:text-cream-100/15">·</span>
          )}
        {visibleFields.includes("forks") && (
          <a
            href={`${stats.url}/forks`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition hover:text-ink-700 dark:hover:text-cream-100"
          >
            <GitFork className="h-3.5 w-3.5" />
            <span className="font-semibold text-ink-700 dark:text-cream-100">
              {fmt(stats.forks)}
            </span>
            <span>forks</span>
          </a>
        )}
        {visibleFields.includes("forks") &&
          visibleFields.includes("watchers") && (
            <span className="text-ink-200 dark:text-cream-100/15">·</span>
          )}
        {visibleFields.includes("watchers") && (
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-semibold text-ink-700 dark:text-cream-100">
              {fmt(stats.watchers)}
            </span>
            <span>watching</span>
          </span>
        )}
        <span className="text-ink-200 dark:text-cream-100/15">·</span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-ink-700 dark:text-cream-100">
            MIT
          </span>
          <span>License</span>
        </span>
      </div>
    );
  }

  // footer
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {fields.includes("stars") && stats.stars > 0 && (
        <a
          href={stats.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-900 dark:text-cream-100/50 dark:hover:text-cream-50"
        >
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="font-semibold">{fmt(stats.stars)}</span>
        </a>
      )}
      {fields.includes("forks") && stats.forks > 0 && (
        <a
          href={`${stats.url}/forks`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-900 dark:text-cream-100/50 dark:hover:text-cream-50"
        >
          <GitFork className="h-3.5 w-3.5" />
          <span className="font-semibold">{fmt(stats.forks)}</span>
        </a>
      )}
    </div>
  );
}
