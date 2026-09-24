# Level 1 Creative Space — Gemini chats + carousel

## What changed

- Creative Space suggestion chips (`Briefing`, `Neue Routine`, `Draft`) start
  a real channel with a seeded first message (same path as the composer).
- Carousel direction matches the arrows: **→** moves the deck right,
  **←** moves it left. Slide uses a longer travel distance and a spring-like
  cubic-bezier so the shift reads clearly.
- Role-description (“message”) field is taller; bottom Ask-anything composer
  is taller (`min-h-24`).

## Gemini (local)

Set in `Connect/.env` (not committed):

```
BOT_PROVIDER=google
BOT_MODEL=gemini-3.1-flash-lite
GOOGLE_API_KEY=…
```

Then recreate the Bot:

```bash
cd Connect && docker compose up -d --force-recreate --no-deps agent-langgraph
```

`gemini-3.1-flash-lite` was the model that answered with this AI Studio key
when Flash/Pro returned 503/429.
