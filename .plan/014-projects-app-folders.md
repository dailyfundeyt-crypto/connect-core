# 014 — Projekte mit App-Logos & Level 3 Ordner

**Datum:** 2026-09-21

## Verhalten

- Projekte gehören zu einem Unternehmen und haben ein **App-Logo** (Arc, Linear, Slack, Browser).
- Auf **Level 2**: reiche Projektliste; Klick/Doppelklick öffnet ein **X-Style Projektprofil** (Banner + App-Logo + Agenten).
- Auf **Level 3**: Agenten-Auswahl als **Unterordner unter dem App-Logo**; Projekte gruppieren die Leute.

## Assets

- `app/public/apps/arc.png` (bereitgestellt)
- `linear.png`, `slack.png`, `browser.png` (generiert)

## Seed

`ensureSeedProjects` legt pro Company drei Demo-Projekte an (Arc / Linear / Slack).
