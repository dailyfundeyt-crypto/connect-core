/**
 * T3-Bridge — CLI-Katalog und Anzeige-Reihenfolge (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Vorgabe aus Stefans Entscheidung und Masterplan:
 *  1. Reihenfolge bei aktivem Flag `connect.t3.cliSwap`:
 *     Codex, Claude zuerst, dann alle weiteren T3-/Fork-CLIs aus A04
 *     (Cursor, Grok, OpenCode, Antigravity, Pi, Muse, fx, Hermes, Freebuff, ChatGPT),
 *     danach Legacy-Ziele (Manus, Lovable, ZGPT).
 *  2. Bei inaktivem Flag (`cliSwap = false`):
 *     Exakt die alte Reihenfolge und Einträge aus `CLI_TARGETS` (agent-cli.ts).
 */

import type { T3ProviderId } from "@/lib/t3/contracts";
import type { T3CliEngine } from "./types";

export type T3CliDefinition = {
  id: string;
  label: string;
  engine: T3CliEngine;
  providerId: T3ProviderId | "legacy";
  hint: string;
  fork?: boolean;
  badge?: string;
};

/**
 * Standard-Katalog für den T3-CLI-Tausch in der verbindlichen Reihenfolge:
 *  1. Codex, Claude zuerst
 *  2. Weitere T3-/Fork-CLIs (Cursor, Grok, OpenCode, Antigravity, Pi, Muse, fx, Hermes, Freebuff, ChatGPT)
 *  3. Legacy-Ziele (Manus, Lovable, ZGPT)
 */
export const T3_SWAP_CLI_CATALOG: readonly T3CliDefinition[] = [
  // 1. Codex & Claude zuerst (Stefans Vorgabe)
  {
    id: "codex",
    label: "Codex",
    engine: "t3",
    providerId: "codex",
    hint: "OpenAI Codex CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "claude",
    label: "Claude",
    engine: "t3",
    providerId: "claudeAgent",
    hint: "Anthropic Claude Code / CLI über T3-Engine",
    badge: "T3",
  },
  // 2. Weitere T3- & Fork-CLIs aus A04
  {
    id: "cursor",
    label: "Cursor",
    engine: "t3",
    providerId: "cursor",
    hint: "Cursor Agent CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "grok",
    label: "Grok",
    engine: "t3",
    providerId: "grok",
    hint: "xAI Grok Bot / CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "opencode",
    label: "OpenCode",
    engine: "t3",
    providerId: "opencode",
    hint: "OpenCode CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    engine: "t3",
    providerId: "antigravity",
    hint: "Antigravity CLI (agy) über T3-Engine",
    badge: "T3",
  },
  {
    id: "pi",
    label: "Pi",
    engine: "t3",
    providerId: "pi",
    hint: "Inflection Pi CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "muse",
    label: "Muse",
    engine: "t3",
    providerId: "muse",
    hint: "Muse.ai Cloud-Agent CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "fx",
    label: "fx",
    engine: "t3",
    providerId: "hermes",
    hint: "fx Terminal CLI über T3-Engine",
    badge: "T3",
  },
  {
    id: "hermes",
    label: "Hermes",
    engine: "t3",
    providerId: "hermes",
    hint: "Hermes ACP Agent CLI über T3-Engine (Hermes-Fork)",
    fork: true,
    badge: "Fork",
  },
  {
    id: "freebuff",
    label: "Freebuff",
    engine: "t3",
    providerId: "freebuff",
    hint: "Freebuff Browser-OAuth CLI über T3-Engine (Hermes-Fork)",
    fork: true,
    badge: "Fork",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    engine: "t3",
    providerId: "codex",
    hint: "ChatGPT Modelle über T3 Codex-Bridge",
    badge: "T3",
  },
  // 3. Legacy-Ziele (kein T3-Treiber)
  {
    id: "manus",
    label: "Manus",
    engine: "legacy",
    providerId: "legacy",
    hint: "Manus CLI (Legacy-Engine)",
    badge: "Legacy",
  },
  {
    id: "lovable",
    label: "Lovable",
    engine: "legacy",
    providerId: "legacy",
    hint: "Lovable Builder CLI (Legacy-Engine)",
    badge: "Legacy",
  },
  {
    id: "zgpt",
    label: "ZGPT",
    engine: "legacy",
    providerId: "legacy",
    hint: "ZGPT Terminal CLI (Legacy-Engine)",
    badge: "Legacy",
  },
];

/**
 * Bisherige Optionen aus `CLI_TARGETS` (`apps/app/src/lib/agents/agent-cli.ts`).
 * Wird 1:1 verwendet, wenn das Feature-Flag `connect.t3.cliSwap` deaktiviert ist.
 */
export const LEGACY_CLI_CATALOG: readonly {
  id: string;
  label: string;
  prompt: string;
  hint: string;
}[] = [
  {
    id: "antigravity",
    label: "Antigravity",
    prompt: "agy>",
    hint: "Antigravity CLI (agy) — Browser Use, Sandbox, Login via Google",
  },
  {
    id: "manus",
    label: "Manus",
    prompt: "manus>",
    hint: "Manus CLI — also used for mail→chat routing",
  },
  {
    id: "codex",
    label: "Codex",
    prompt: "codex>",
    hint: "OpenAI Codex via your API key (Settings → Usage)",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    prompt: "chatgpt>",
    hint: "ChatGPT models via the same Codex bridge",
  },
  {
    id: "claude",
    label: "Claude",
    prompt: "claude>",
    hint: "Anthropic Claude Code / CLI",
  },
  {
    id: "grok",
    label: "Grok",
    prompt: "grok>",
    hint: "xAI Grok bot / CLI",
  },
  {
    id: "cursor",
    label: "Cursor",
    prompt: "cursor>",
    hint: "Cursor agent via Codex bridge (same local proxy)",
  },
  {
    id: "lovable",
    label: "Lovable",
    prompt: "lovable>",
    hint: "Lovable builder CLI",
  },
  {
    id: "freebuff",
    label: "Freebuff",
    prompt: "freebuff>",
    hint: "Freebuff CLI — Browser-OAuth, Built-in Browser-Use",
  },
];
