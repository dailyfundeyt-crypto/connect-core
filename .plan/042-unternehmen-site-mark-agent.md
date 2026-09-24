# 042 — Unternehmen: Markieren → Agent → Auftrag (Browser Use)

## Flow

1. Links Agent anklicken (bleibt auf der Firmenseite, öffnet keinen Chat).
2. **Markieren** — Rechteck über der Seite ziehen (Overlay, cross-origin-safe).
3. Text-Auftrag im Composer unten schreiben.
4. **Auftrag** → Channel mit Prompt (URL + %-Bereich + Text); Browser Use startet.

## Grenzen

- Iframe fremder Origin: kein DOM-Peek, nur Viewport-%-Rechtecke.
- Echtes Element-Klicken braucht Connect Desktop / Host-Chrome + Browser Use.
