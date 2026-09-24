# "What is the Purpose of Life?" — Hand-Drawn Collage Animation

A 50-second, pure-JavaScript hand-drawn collage animation. No external libraries.
Rendered to a 1080p MP4 via headless Chromium + ffmpeg. Designed to be voiced
with ElevenLabs and bedded with Suno/Udio.

## What you have

| File | What it is |
|------|------------|
| `out/purpose-of-life.mp4` | The final video — 50 s, 1920×1080, H.264, no audio |
| `src/index.html` | The entire animation, one self-contained file. Open in a browser to preview in real time. |
| `render.mjs` | Headless renderer — loads the HTML, scrubs the timeline, captures 1500 JPEGs to `out/frames/` |
| `encode.mjs` | Encodes `out/frames/*.jpg` → `out/purpose-of-life.mp4` via ffmpeg |
| `smoke*.mjs` | Tiny test scripts used to benchmark the renderer |
| `prompts/ELEVENLABS.txt` | The voiceover script + per-line timing markers + recommended voice settings |
| `prompts/MUSIC.txt` | Two Suno/Udio prompts (instrumental bed + full vocal) + ffmpeg mix command |
| `prompts/MONETIZATION-PLAN.md` | 30-video calendar + revenue math + ranked categories |

## Quick start

```bash
# 1. install the only dependency (Playwright)
bun install

# 2. (optional) preview in real time
#    just open src/index.html in a browser

# 3. render & encode in one shot
bun run all

# or step by step
bun run render.mjs     # ~100 seconds → out/frames/frame_NNNNN.jpg
bun run encode.mjs     # ~20 seconds  → out/purpose-of-life.mp4
```

Output: `out/purpose-of-life.mp4` (≈19 MB, 50 s).

## The animation, beat by beat

| Time | Beat | Visual |
|------|------|--------|
| 0–3 s | Title | "what is the purpose of life?" on a torn yellow card with washi tape and a doodle arrow |
| 3–9 s | The usual answers | Five colored torn cards: *money? fame? kids? power? success?* — then a red X crosses them out: "not quite." |
| 9–16 s | The weight | Ticking clock, hourglass, empty chair, photo of a heart with a crack, string lights overhead |
| 16–23 s | The pivot | "maybe it isn't a destination." with a doodle arrow; paper plane drifts across |
| 23–32 s | The small things | Coffee, hand reaching, sunset behind mountains, child silhouette + flowers |
| 32–40 s | The doing | Envelope with heart stamp, paper plane, tree growing branch-by-branch, "LIVED • NOT • SOLVED" stamp |
| 40–46 s | The quiet | Watercolor landscape — mountains, river with ripples, single candle |
| 46–50 s | The answer | "you don't find the answer. you make it. — then you live it." + gold "PURPOSE • IS • A • VERB" stamp |

## How the look was built

Every "drawn" line is **two passes** through `roughLine()` / `roughCircle()` —
one thick soft, one thin ink — with a deterministic wobble (Mulberry32 seeded
RNG) so the same frame always renders identically. Paper texture, vignette and
a faint grain overlay sit underneath. Torn cards are constructed by stepping
around the perimeter and jiggling every point. Washi tape, ink splatters, hand-
drawn arrows and stamp circles complete the collage vocabulary.

Every drawing primitive is a single function in `src/index.html`:
`roughLine`, `roughRect`, `roughCircle`, `roughPath`, `handText`, `tornCard`,
`washiTape`, `inkSplat`, `stampCircle`, plus per-asset helpers
(`drawClock`, `drawHourglass`, `drawCoffee`, `drawHand`, `drawMountain`,
`drawCandle`, etc.). The composition is `renderFrame(t)` which calls the
active `drawBeatN(t)` functions in z-order — copy-paste any beat as a
template for a new video.

## Adding audio

The MP4 is silent. Two prompts live in `prompts/`:

1. **`prompts/ELEVENLABS.txt`** — drop the script into ElevenLabs Speech
   Synthesis. Daniel or Adam recommended for philosophical narration.
   The file has line-by-line time markers so the audio lines up with the
   visuals when you lay them on a timeline in your editor.

2. **`prompts/MUSIC.txt`** — Suno v4 / Udio prompt for the instrumental bed
   (and an alternate full-vocal version if you'd rather skip ElevenLabs).
   Includes tempo (78 BPM), key (D major), and a one-liner ffmpeg command
   that mixes voice + music with the music ducked under the voice.

A typical workflow:

```
ElevenLabs  →  voice.wav
Suno/Udio   →  music.mp3
DaVinci / CapCut / Premiere  →  assemble
ffmpeg (one-liner in MUSIC.txt)  →  final mix
```

## Production workflow for a new video

The animation pipeline runs at ~15 fps of capture × 2.7× encode speed.
A new 50-second video takes about **3 minutes** from `bun run all` to MP4.

For a new video in this series:

1. Write the script in `prompts/ELEVENLABS.txt` form first.
2. Open `src/index.html`, copy a `drawBeatN` function, swap the visuals
   to match your new script.
3. `bun run all`.
4. Generate voice + music.
5. Mix in your editor of choice.
6. Upload to Shorts / Reels / TikTok.

`prompts/MONETIZATION-PLAN.md` has the 30-video calendar and revenue math.

## Notes on the renderer

- **Headless Chromium** loads the HTML and calls `window.__renderFrame(0, t)`
  with `t` in seconds for each of 1500 frames. The animation is
  *deterministic in `t`*, so we don't wait for the real-time loop — we just
  scrub. Output: 1920×1080 JPEG @ q=0.92, ~250 KB per frame.
- **Speed:** ~15 fps capture on a single thread. 1500 frames in ~100 s.
- **ffmpeg** takes those JPEGs and writes a single 1080p H.264 MP4
  (`libx264 -preset slow -crf 18`, ~3 Mbps).
- **No audio** — audio is assembled downstream so the visual cuts are
  not coupled to the voice track. If you re-render the visual and keep
  the audio, the timing in `prompts/ELEVENLABS.txt` still lines up.

## Files not to commit

`out/frames/` is ~380 MB. Add it to `.gitignore` if you version this.
The `out/purpose-of-life.mp4` is small (~19 MB) and worth keeping.
