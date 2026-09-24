# Local Whisper + Meet-style voice calls + ElevenLabs key ring

## What
- Local Whisper STT via `@huggingface/transformers` (`Xenova/whisper-tiny`) in the browser, with Web Speech captions while listening.
- Meet/Zoom-style call card (avatars, dotted link, Stimme / Geschwindigkeit / Sprache, hang-up + tones).
- Composer: mic (Hört zu… + timer) and waveform call button.
- ElevenLabs TTS (`eleven_flash_v2_5`) with rotating API keys every 8000 characters; keys in Settings → Voice (localStorage).
- Seed key from `VITE_ELEVENLABS_API_KEY` / `.env` (not committed).

## Where
- `lib/voice/whisper.ts`, `lib/voice/elevenlabs.ts`, `lib/voice/call-tones.ts`
- `components/voice/voice-call-overlay.tsx`, `composer-voice.tsx`
- Wired in home composer, channel `ConversationView`, settings sidebar.
