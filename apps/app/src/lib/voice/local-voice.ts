/**
 * Local speech services, through the Connect server (same origin, no CORS):
 *   STT  → /api/voice-bridge/stt → whisper-local --serve (127.0.0.1:7777, model "small")
 *   TTS  → /api/voice-bridge/tts → Kokoro German (127.0.0.1:8880; Windows voice as fallback)
 * Both are optional: callers fall back to the in-browser Whisper / browser speech when absent.
 */

const STATUS_TTL_MS = 15_000;
let statusCache: { at: number; stt: boolean; tts: boolean } | null = null;

/** Which local services answer right now (cached briefly). */
export async function localVoiceStatus(): Promise<{ stt: boolean; tts: boolean }> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache;
  try {
    const res = await fetch("/api/voice-bridge/status", { credentials: "include" });
    const body = (await res.json().catch(() => null)) as
      | { stt?: { ok?: boolean }; tts?: { ok?: boolean } }
      | null;
    statusCache = { at: Date.now(), stt: Boolean(res.ok && body?.stt?.ok), tts: Boolean(res.ok && body?.tts?.ok) };
  } catch {
    statusCache = { at: Date.now(), stt: false, tts: false };
  }
  return statusCache;
}

/** Words whisper should favour (product names it otherwise mishears, e.g. "Vercel" → "Verzähl"). */
export const PREFERRED_WORDS = [
  "Connect",
  "Notch",
  "Vercel",
  "Supabase",
  "Helium",
  "Ollama",
  "Kokoro",
  "GitHub",
  "Render",
  "Figma",
  "Notion",
  "Screenshot",
  "Agent",
  "Hermes",
  "Brain",
  "Stefan",
];

/**
 * The browser records WebM/Opus, which whisper-local's decoder (libsndfile / wave) cannot read,
 * so the recording is decoded here and re-encoded as 16 kHz mono 16-bit WAV.
 */
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  if (blob.type.includes("wav")) return blob;
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16_000;
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const ascii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) out.setUint8(offset + i, text.charCodeAt(i));
    };
    ascii(0, "RIFF");
    out.setUint32(4, 36 + pcm.length * 2, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, rate, true);
    out.setUint32(28, rate * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    ascii(36, "data");
    out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i += 1) {
      const v = Math.max(-1, Math.min(1, pcm[i] ?? 0));
      out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return new Blob([out.buffer], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

/** Transcribe a recording with whisper-local. Throws when the service is not there. */
export async function transcribeLocal(
  audio: Blob,
  options: { language?: string; extraWords?: string[] } = {},
): Promise<string> {
  const form = new FormData();
  form.append("file", await blobToWav16k(audio), "speech.wav");
  form.append("response_format", "json");
  const lang = (options.language ?? "de").split("-")[0];
  if (lang && lang !== "auto") form.append("language", lang);
  form.append("prompt", [...PREFERRED_WORDS, ...(options.extraWords ?? [])].join(", "));
  const res = await fetch("/api/voice-bridge/stt", { method: "POST", body: form, credentials: "include" });
  const body = (await res.json().catch(() => null)) as { text?: string; error?: unknown } | null;
  if (!res.ok || typeof body?.text !== "string") {
    throw new Error("Lokale Spracherkennung nicht verfügbar.");
  }
  return body.text.trim();
}

/** Synthesise German speech locally. Resolves with WAV bytes. */
export async function synthesizeLocal(
  text: string,
  options: { voice?: string; speed?: number } = {},
): Promise<ArrayBuffer> {
  const res = await fetch("/api/voice-bridge/tts", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: text, voice: options.voice ?? "martin", speed: options.speed ?? 1 }),
  });
  if (!res.ok) throw new Error("Lokale Stimme nicht verfügbar.");
  return res.arrayBuffer();
}

let currentAudio: HTMLAudioElement | null = null;

/** Stop whatever local speech is playing (barge-in, hang-up). */
export function stopLocalSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

function playWav(buffer: ArrayBuffer, playbackRate = 1): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    const audio = new Audio(url);
    audio.playbackRate = playbackRate;
    currentAudio = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    void audio.play().catch(done);
  });
}

/**
 * Speak sentence by sentence: the next sentence is synthesised while the current one plays, so the
 * first words come out after about one sentence of synthesis instead of the whole reply.
 */
export async function speakLocal(
  sentences: readonly string[],
  options: { voice?: string; speed?: number; signal?: AbortSignal } = {},
): Promise<void> {
  if (sentences.length === 0) return;
  let next: Promise<ArrayBuffer> | null = synthesizeLocal(sentences[0], options);
  for (let i = 0; i < sentences.length; i += 1) {
    if (options.signal?.aborted) return;
    const buffer: ArrayBuffer = await next!;
    next = i + 1 < sentences.length ? synthesizeLocal(sentences[i + 1], options) : null;
    if (options.signal?.aborted) return;
    await playWav(buffer);
  }
}
