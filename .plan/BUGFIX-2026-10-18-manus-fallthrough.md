# BUGFIX 2026-10-18 20:10 — Kein Manus-API-Key blockierte Codex/Claude Quick-Actions

## Symptom
User mit "Settings → Model Provider = API-Key (Manus)" und **keinem** hinterlegten Manus-Key bekam bei jeder Codex- oder Claude-Quiick-Action die Antwort:

> "Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus)."

Das ist falsch: Der User hat Codex/Claude/Antigravity angefragt — nicht Manus. Die Fehlermeldung tauchte nur auf, weil der globale `dispatchModelTurn()` bei `apiFlavor === "manus"` immer `runManusApiPath()` aufrief.

## Fix
`apps/app/src/lib/agents/model-provider-dispatch.ts` → `runManusApiPath()`:

```ts
if (!key) {
  // No Manus API key — silently fall through to the local headless CLI path
  // (Codex / Antigravity / Claude). The user did not opt into Manus Cloud;
  // we should not block their normal chat with a key-prompt error.
  const headless = await tryHeadlessCodex(input);
  if (headless) return headless;
  const result = await runZgptCliTurn({ ... });
  return { ok: result.ok, summary: result.summary };
}
```

→ Build, robocopy-Sync ins `runtime/connect/apps/app/dist/`, kein Server-Restart nötig (serveStatic liest von Disk).

## Verifikation
Im UI (Browser-Tab `glass-browser-6e8313e3...`):
- `codex_run` MCP-Tool: "Hallo! Ich bin Codex CLI, ein KI-Assistent von OpenAI, der auf Kommandozeile läuft…" ✅
- `claude_run` MCP-Tool: "Hallo! Ich bin Claude Code, ein von Anthropic entwickelter KI-Assistent…" ✅
- `antigravity_run`: lief schon vorher (Gemini 3.8 Flash) ✅
- Manus-Mail-Panel / `task.create`: zeigen weiterhin korrekt "Kein Manus-API-Key" — gewollt.

## Folge-Aufgaben
- Stufe 2.1 läuft weiter (browser-use Sidecar für Codex/Claude Web-Steuerung).
