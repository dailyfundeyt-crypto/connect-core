# Drittsoftware und Lizenzen

Der Connect SEO-Agent verbindet diese Open-Source-Bausteine. Alle laufen lokal auf diesem PC.

| Baustein | Zweck | Lizenz | Quelle |
|---|---|---|---|
| jev-seo 0.1.1 (Agrici Daniel) | Crawl, 52 SEO-Regeln, Scoring, Berichte | MIT, siehe `vendor/jev-seo/LICENSE` | https://github.com/AgriciDaniel/jev-seo |
| Laya 0.3.26 (Convai Innovations / NandhaKishorM) | Lokaler Seiten-Richter, gleiches `/v1/systemone`-Protokoll wie TypeSafe Jev | Apache-2.0 (Code und Gewichte) | https://github.com/NandhaKishorM/laya |
| Ollama | Lokaler Modell-Server | MIT | https://github.com/ollama/ollama |
| Qwen3 8B (Alibaba Qwen) | Lokales Sprachmodell für Antworten und Werkzeugwahl | Apache-2.0 | https://ollama.com/library/qwen3 |
| Playwright for Python (Microsoft) | Browser-Steuerung | Apache-2.0 | https://github.com/microsoft/playwright-python |
| Helium | Browser (eigenes, getrenntes Profil, headless) | GPL-3.0 / Chromium-Lizenzen | https://github.com/imputnet/helium |

Änderungen an jev-seo: `vendor-jev-seo.patch` (Judge-Endpunkt per Umgebungsvariable, Preis 0 für den lokalen Richter, Helium für JavaScript-Rendering). Ohne diese Variablen verhält sich jev-seo wie das Original.
