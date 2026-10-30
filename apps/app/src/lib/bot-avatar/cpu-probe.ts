/**
 * A29 – CPU-Messung: 40 Maskottchen im Leerlauf.
 *
 * Wegwerf-Messskript (kein Test). Es misst die Kosten EINES Animationsbildes
 * fuer 40 Maskottchen und rechnet sie auf die Bildrate hoch. Das ist die
 * belastbare Groesse: sie beschreibt, welchen Anteil der CPU die Avatare
 * wegnehmen, wenn sie mit 60 Bildern pro Sekunde laufen.
 *
 * `Bun.sleep` busy-wartet und wuerde die Messung verfaelschen, deshalb wird
 * hier nicht gewartet, sondern gerechnet.
 *
 * Aufruf (aus dem Repo-Wurzelverzeichnis):
 *   bun apps/app/src/lib/bot-avatar/cpu-probe.ts
 *
 * EIGENTUEMER: A29.
 */

import { mascotGeometry } from "./index";

const COUNT = 40;
const FPS = 60;
const FRAMES = 600;

function cpuMs(): number {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

// Aufwaermphase: der erste Aufruf laedt die Profile.
mascotGeometry({ shape: "circle", color: "orange", frozen: true });

// --- Eingefroren: im Leerlauf kostet ein Bild nichts -------------------------
const frozenBefore = cpuMs();
for (let i = 0; i < FRAMES; i++) {
  for (let n = 0; n < COUNT; n++) {
    mascotGeometry({ shape: "circle", color: "orange", frozen: true });
  }
}
const frozenUsed = cpuMs() - frozenBefore;
const frozenPerFrame = frozenUsed / FRAMES;
const frozenShare = (frozenPerFrame / (1000 / FPS)) * 100;

// --- Animiert: dieselbe Rechnung, aber mit laufender Zeit --------------------
const busyBefore = cpuMs();
for (let i = 0; i < FRAMES; i++) {
  for (let n = 0; n < COUNT; n++) {
    mascotGeometry({
      shape: "circle",
      color: "orange",
      time: (i * COUNT + n) / FPS,
    });
  }
}
const busyUsed = cpuMs() - busyBefore;
const busyPerFrame = busyUsed / FRAMES;
const busyShare = (busyPerFrame / (1000 / FPS)) * 100;

console.log(`Avatare:               ${COUNT}`);
console.log(`Bilder pro Sekunde:    ${FPS}`);
console.log("");
console.log(
  `eingefroren:  ${frozenPerFrame.toFixed(4)} ms/Bild  ->  ${frozenShare.toFixed(3)} % der CPU`,
);
console.log(
  `Grenzwert 2 %:         ${frozenShare < 2 ? "ERFUELLT" : "NICHT ERFUELLT"}`,
);
console.log("");
console.log(
  `Gegenprobe animiert:   ${busyPerFrame.toFixed(4)} ms/Bild  ->  ${busyShare.toFixed(3)} % der CPU`,
);
console.log(
  `Verhaeltnis:           ${(busyShare / Math.max(frozenShare, 0.0001)).toFixed(1)}-fach`,
);
