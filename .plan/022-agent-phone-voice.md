# 022 — Per-bot phone / voice settings

Bots get Stimme, Geschwindigkeit, Sprache, and Benachrichtigungen on
Agent → General (Telefonate), matching the call Einstellungen pattern.

- Stored per `agentId` in localStorage (`connect.agent-voice`)
- “Nicht festgelegt” inherits global Settings → Voice
- Call overlay reads/writes the same prefs when `agentId` is present
- Voice presets use astronomical labels (Helix, Altair, Ara, …)
- Preview play button samples TTS (ElevenLabs or browser speech)
