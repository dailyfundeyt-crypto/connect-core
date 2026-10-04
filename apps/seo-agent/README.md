# Connect SEO-Agent (lokal)

Ein vorinstallierter Agent für Connect, der Websites per SEO prüft, komplett auf diesem PC:

- **Browser:** Playwright steuert Helium headless in einem eigenen Profil (`%LOCALAPPDATA%\ConnectSEO\helium-profile`). Seiten öffnen, klicken, Screenshots, DOM-Snapshots. Formulare werden nie abgeschickt, interne Adressen nie geöffnet.
- **Audit:** jev-seo (MIT) crawlt die Website und prüft 52 Regeln; die Seiten-Bewertung macht Laya lokal statt der Cloud-API Jev.
- **Sprache:** Qwen3 8B über Ollama.
- **Bericht:** `Dokumente\jev-seo-reports\<domain>-<datum>\report.md` mit Maßnahmen-Tabelle; im Chat verlinkt (`http://127.0.0.1:4310/reports/...`).

Start: `scripts\Start-SeoServices.ps1` (wird von `Start-Connect.ps1` automatisch aufgerufen, alles unsichtbar).
Stopp: `scripts\Stop-SeoServices.ps1` (mit `-All` auch Ollama). Logs: `%LOCALAPPDATA%\ConnectSEO\logs`.

In Connect ist der Agent über `apps/examples/fintech/agents/seo-agent.yaml` als `remote-ag-ui` mit `http://127.0.0.1:4310/` eingetragen.
Lizenzen und Quellen: `NOTICE.md`.
