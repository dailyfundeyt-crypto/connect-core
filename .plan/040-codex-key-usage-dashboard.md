# Phase C.0 — Codex API-Key + Token-Dashboard

Ergänzung zu [039](./039-phase-b-codex-bridge.md): **dein Codex-API-Key** in Connect + sichtbare Tokennutzung.

## Was du wolltest

1. Codex-API-Key in der App nutzen (nicht nur lokaler Proxy ohne Key)
2. ~10 Mio. Tokens Budget
3. Dashboard in den Einstellungen wie eine Heatmap (Täglich / Wöchentlich / Kumuliert)

## Was drin ist

### Settings → Usage (`#usage`)
- **Codex API-Key** (verschlüsselt in Postgres KV)
- **Budget** in Mio. Tokens (Default 10)
- **Base URL** (default `https://api.openai.com/v1` — oder dein lokaler Proxy)
- **Model** (default `gpt-5`)
- Heatmap + Stats: insgesamt, Restbudget, Spitzentag, Aufrufe

### Tracking
- Jeder erfolgreiche Bot-CLI-Call (ChatGPT/Cursor) über `/api/cli-bridge/run` speichert `usage` aus der Completions-Antwort
- Mock-Mode zählt ebenfalls (zum Testen der Heatmap)

### API
- `GET /api/cli-bridge/usage`
- `PUT /api/cli-bridge/settings` `{ apiKey?, budgetTokens, baseUrl, model, clearApiKey? }`

## Wichtig

Das Dashboard zeigt **was Connect mit diesem Key verbraucht** — nicht den globalen OpenAI-/Codex-Account-Graphen aus der Web-UI. Deine 58 Mio. dort und die Zahlen hier sind verschiedene Zähler; das Budget (10 Mio.) setzt du bewusst als Soft-Limit für Connect.

## So nutzen

1. Settings → Usage → Key einfügen, Budget 10, Speichern  
2. Bot-CLI auf **ChatGPT** oder **Cursor**  
3. Befehl senden → Antwort + Tokens erscheinen in der Heatmap  

Env-Alternative: `CONNECT_CODEX_API_KEY` oder `CODEX_API_KEY` in `.env` (Settings-Key hat Vorrang).

## Nächster Schritt

Phase C (Wave Command-Blocks) oder Built-in-Bots optional denselben Key mitnutzen.
