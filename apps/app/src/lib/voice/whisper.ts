/**
 * Local speech-to-text via Whisper (transformers.js) in the browser.
 * Falls back to the Web Speech API when the model cannot load.
 */

import { getVoiceSettings } from "./elevenlabs";

export type TranscribeOptions = {
  /** BCP-47 language hint, e.g. de-DE. Auto when omitted. */
  language?: string;
  signal?: AbortSignal;
};

let whisperPipeline:
  | null
  | ((
      input: Float32Array | string,
      opts?: object,
    ) => Promise<unknown>) = null;
let whisperLoading: Promise<void> | null = null;

async function ensureWhisper(): Promise<void> {
  if (whisperPipeline) return;
  if (whisperLoading) return whisperLoading;
  whisperLoading = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    // Tiny multilingual model — runs fully in-browser (WASM/WebGPU).
    const pipe = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny",
      { dtype: "q8" },
    );
    whisperPipeline = pipe as unknown as typeof whisperPipeline;
  })();
  try {
    await whisperLoading;
  } catch (error) {
    whisperLoading = null;
    whisperPipeline = null;
    throw error;
  }
}

/** Decode an audio Blob to mono Float32Array at 16 kHz for Whisper. */
async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    if (decoded.sampleRate === 16_000) return channel;
    // Resample simply by linear interpolation when the browser ignored our request.
    const ratio = decoded.sampleRate / 16_000;
    const length = Math.floor(channel.length / ratio);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = channel[Math.floor(i * ratio)] ?? 0;
    }
    return out;
  } finally {
    await ctx.close();
  }
}

/**
 * Transcribe a recorded audio blob with local Whisper.
 * Returns trimmed text or throws.
 */
export async function transcribeWithWhisper(
  blob: Blob,
  options: TranscribeOptions = {},
): Promise<string> {
  await ensureWhisper();
  if (!whisperPipeline) throw new Error("Whisper is not available.");
  const audio = await blobToFloat32(blob);
  const lang = (options.language ?? getVoiceSettings().language ?? "auto")
    .replace(/-.*/, "")
    .toLowerCase();
  const result = await whisperPipeline(audio, {
    language: lang === "auto" || !lang ? null : lang,
    task: "transcribe",
  });
  const text =
    typeof result === "string"
      ? result
      : result &&
          typeof result === "object" &&
          "text" in result &&
          typeof (result as { text: unknown }).text === "string"
        ? (result as { text: string }).text
        : "";
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No speech detected.");
  return trimmed;
}

/** Whether Whisper has already been downloaded/warmed in this session. */
export function isWhisperReady(): boolean {
  return Boolean(whisperPipeline);
}

/** Prefetch the model in the background (call when opening Settings → Voice). */
export function prefetchWhisper(): void {
  void ensureWhisper().catch(() => {
    // Optional warm-up — failures fall back to Web Speech at use time.
  });
}

/**
 * Record microphone audio until `stop` is called, then return the Blob.
 */
export function startMicRecording(): Promise<{
  stop: () => Promise<Blob>;
  stream: MediaStream;
}> {
  return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(250);
    return {
      stream,
      stop: () =>
        new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => {
            for (const track of stream.getTracks()) track.stop();
            const blob = new Blob(chunks, {
              type: recorder.mimeType || "audio/webm",
            });
            if (blob.size < 256) {
              reject(new Error("Recording too short."));
              return;
            }
            resolve(blob);
          };
          recorder.onerror = () => {
            for (const track of stream.getTracks()) track.stop();
            reject(new Error("Recording failed."));
          };
          try {
            recorder.stop();
          } catch (error) {
            for (const track of stream.getTracks()) track.stop();
            reject(error instanceof Error ? error : new Error("Recording failed."));
          }
        }),
    };
  });
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live interim transcripts via Web Speech (browser-local), used for the
 * "Hört zu…" UI while Whisper handles the final clip when available.
 */
export function startLiveSpeech(options: {
  language?: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}): { stop: () => void } | null {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  const lang = options.language ?? getVoiceSettings().language ?? "de-DE";
  recognition.lang = lang === "auto" ? "de-DE" : lang;
  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = 0; i < event.results.length; i++) {
      const row = event.results[i];
      if (row.isFinal) finalText += row[0].transcript;
      else interim += row[0].transcript;
    }
    if (interim) options.onInterim(interim);
    if (finalText.trim()) options.onFinal(finalText.trim());
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech") {
      options.onError(event.error);
    }
  };
  recognition.onend = () => {
    // Keep listening while the call is open — caller restarts if needed.
  };
  recognition.start();
  return {
    stop: () => {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // ignore
        }
      }
    },
  };
}
