# Stufe 2 — Antigravity-CLI + Codex-CLI + browser-use

**Datum:** 2026-10-18
**Status:** 🟢 STUFE 2A LEBT (Antigravity installiert + angemeldet + antwortet über MCP)

## Was schon im Code ist (Production-Build verifiziert)

`apps/connect-app/runtime/connect/apps/server/src/agent-hub/cli-model.ts` (27 KB) enthält die **vollständige** Anbindung für drei CLI-Provider:

```ts
export type CliKind = "codex" | "claude" | "antigravity";
export const CLI_MODELS: Record<CliKind, string[]>;
export function cliEntry(kind: CliKind): string | null;
export async function* runCli(options: CliRunOptions): AsyncGenerator<CliEvent>;
export function createCliModel(input): LanguageModelV2;
export async function cliStatus(kind: CliKind): Promise<CliStatus>;
export function startCliLogin(kind: CliKind): { started: boolean; message: string };
```

### Antigravity-spezifisch

- **Binär-Suche:** `%LOCALAPPDATA%\agy\bin\agy.exe` → `~/.local/bin/agy` → PATH
- **Stream-Parser** (`parseAntigravityLine`): versteht `assistant`, `text`, `tool_use`, `result`, `error`, `api_retry`
- **Args:** `agy -p --output-format stream-json --no-color -C <workdir> [--model X] [--sandbox on]`
- **Modelliste:** `auto`, `gemini-3.8-flash-{high,medium,low}`, `gemini-3.7-flash-{high,medium,low}`, `gemini-3.1-pro-{high,low}`

## Verifikation (2026-10-18 19:42)

✅ **Antigravity End-to-End LIVE!**
- `agy.exe` installiert in `%LOCALAPPDATA%\agy\bin\` (Version 1.4.2)
- Google-Auth offenbar bereits vorhanden — `agy --print "Hello"` antwortet mit:
  > "Hello! I am **Antigravity**, an AI assistant powered by Google's **Gemini 3.8 Flash** model."
- MCP-Tool `antigravity_run` im UI geklickt → Connect hat agy gespawnt → Gemini hat geantwortet → Antwort ist als Result-Block im UI erschienen.

## Bug-Fix-Log

1. **Production-build hatte veraltete `cliEntry` Funktion** (11.10.2026-Version)
   - Symptom: agy wird nicht gefunden obwohl vorhanden
   - Fix: Dev-Version (27 KB) ersetzt — Backup: `cli-model.ts.bak-pre-antigravity-20261018-193930`
   - Production-Server neu gestartet (PID 45348, gestartet 19:40:25)

## Installationsschritte (für andere PCs)

```powershell
# Antigravity (Google-OAuth)
irm https://antigravity.google/cli/install.ps1 | iex
# Dann einmalig ein prompt senden, damit der OAuth-Browser-Flow triggert:
& "$env:LOCALAPPDATA\agy\bin\agy.exe" --print "Hello"

# Codex (OpenAI)
npm i -g @openai/codex
codex login

# Claude (Anthropic)
npm i -g @anthropic-ai/claude-code
claude auth login
```

## Noch offen

- **Stufe 2b**: Codex-CLI + `browser-use` Sidecar (Python-Service) — exakt so wie Antigravity, aber mit dem Python-Browser-Use-Tool statt Gemini-Tool
- **Stufe 2c**: Claude-CLI im UI exponieren
- **Stufe 1.3**: CLI-Preview-Toggle im Agent-Panel (iframe localhost:CLI)
- **Stufe 1.2 Sidecar**: Playwright für echten Browser-Screenshot im UI
