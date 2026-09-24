# 011 — Externe Server-Verbindungen aus der UI

**Datum:** 2026-09-21

## Ziel

Alle sichtbaren Wege zu externen Servern entfernen oder stubben, bevor das
lokale Backend (Postgres / Supabase-Rolle) fest verdrahtet wird.

## Entfernt / stubbed

- Agent-Dialog: toter `connection`-Branch und `ConnectionSection`
- Settings → Connected accounts: lokale Hinweis-Seite, kein OAuth/Composio
- Admin → Identity providers: lokale Hinweis-Seite; Nav-Eintrag entfernt
- Admin → Plugins → Composio: Katalog-UI stubbed; „More apps“ ohne Link
- `COMPOSIO_API_KEY` bleibt leer; Kommentar warnt vor Vendor-Calls

## Bewusst lokal belassen

- Docker Postgres (`DATABASE_URL`) als Datenbank
- `supabase/` CLI-Projekt nur als lokale Dokumentation / spätere Erweiterung
- Intelligence-URLs bleiben (Server startet sonst nicht) — separates Thema
