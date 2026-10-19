# Sidecar: Codex/Claude + browser-use (Stufe 2.1)

**Stand 2026-10-18 20:35**

## Was funktioniert
- ✅ `browser-use v0.13.11` ist installiert (Python-Tool von [browser-use.com](https://browser-use.com))
- ✅ `browser_harness.helpers` exponiert die Helper (`goto_url`, `page_info`, `click_at_xy`, `type_text`, `fill_input`, `press_key`, `scroll`, `wait_for_load`, `wait_for_element`, `list_tabs`, `new_tab`, `switch_tab`, `close_tab`, `capture_screenshot`)
- ✅ Der Daemon startet automatisch und findet den Live-Chrome auf 9222
- ✅ Smoke-Test: `Get-Content script.py | browser-use` → "🐴 Example Domain"
- ✅ Hint-Prompt in `cli-model.ts` → Codex liest und folgt ihm
- ✅ Codex bekommt den Pfad zur Skript-Datei (`AGENT_BROWSER_SCRIPT`) als Env-Variable
- ✅ Wir löschen die Skript-Datei vor jedem Run, damit keine Reste bleiben

## Was blockiert (externes Problem)
- ❌ Codex' Windows-Sandbox blockiert das Spawnen von Subprozessen — `CreateProcessWithLogonW failed: 1385`, **auch** mit `--sandbox workspace-write`. Das ist ein fundamentaler Windows-Constraint der Codex-Sandbox, nicht unser Bug.
- ❌ Codex' eigener `codex_apps/browser_use.read_public_web` MCP-Aufruf braucht Guthaben auf browser-use.com (Cloud).
- ❌ Codex' `web_search` Tool liefert für `https://example.com` den Titel "Example Domain" (Fallback).

## Behobene Bugs
- Codex-Sandbox-Default von `read-only` auf `workspace-write` geändert (User-erwartete Sidecar-Funktion)
- `BU_CDP_WS`-Hack entfernt — der Daemon findet den WebSocket-Endpoint jetzt selbst (Chrome 155 hat den Pfad geändert)
- `browserUseContext()` baut jetzt einen **festeren** Hint mit konkretem Skript-Pfad (vorher hatte er nur einen Pseudo-Pfad)

## Offene Aufgaben für 2.1
1. **Sandbox-Bypass für Codex**: Wir müssen Codex ohne Sandbox starten, damit er Subprozesse wie `browser-use` ausführen kann. OpenAI-Flag: `--dangerously-bypass-approvals-and-sandbox` (Stufe-1.2 in Codex-Doku).
2. **Oder: browser-use als MCP-Server exposieren** — Codex kann es dann nativ nutzen, ohne Subprozess. Dafür müsste `browser-use` als `mcp-server`-Modus gestartet werden.
3. **Oder: Antigravity** nutzen, der ein eingebautes Browser-Tool hat. Das funktioniert heute schon, aber wir wollen Codex/Claude auch fit machen.

## Geänderte Dateien
- `apps/connect-app/runtime/connect/apps/server/src/agent-hub/cli-model.ts`:
  - `browserUseContext(scriptPath: string)` — Pfad ist jetzt Pflichtparameter
  - `runCli()` löscht alte `browser-action.py` und setzt `AGENT_BROWSER_SCRIPT` Env-Var
  - Codex `--sandbox` Default: `workspace-write`
  - `BU_CDP_WS` Env-Var entfernt
- `apps/connect-app/runtime/connect/apps/server/src/agent-hub/mcp-tools.ts`:
  - `invokeCodex` und `invokeClaude` zum lokalen `AgentMcpContext.deps` Type hinzugefügt (TypeScript-Fehler behoben)

## Test-Verifikation

**Manueller browser-use Smoke-Test** (PowerShell):
```powershell
$env:BH_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:Path = "$env:Path;C:\Users\Kunc GmbH\.local\bin"
Set-Content -LiteralPath "...\browser-action.py" -Value "goto_url('https://example.com')`nprint(page_info()['title'])"
Get-Content "...\browser-action.py" | browser-use
# → "🐴 Example Domain"
```

**Codex-Test mit browser-use Hint**:
```bash
echo "## Sidecar: browser-use\n[hint...]\n\n---\n\nÖffne https://example.com" | codex exec --sandbox workspace-write -C <workdir> -
# → Codex folgt dem Hint, schreibt Skript, ruft browser-use auf
# → CreateProcessWithLogonW failed: 1385 (Sandbox blockiert)
# → Fallback: Codex' web_search findet "Example Domain"
```
