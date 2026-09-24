/**
 * Soft Meet / Zoom style join, leave, and speak chimes via Web Audio.
 */

export type CallTone = "join" | "leave" | "speak" | "mute" | "unmute";

export function playCallTone(kind: CallTone) {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const beep = (
      freq: number,
      start: number,
      dur: number,
      gain = 0.07,
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(gain, now + start);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };
    if (kind === "join") {
      // Google Meet–like ascending pair
      beep(523.25, 0, 0.16, 0.09);
      beep(659.25, 0.12, 0.22, 0.08);
    } else if (kind === "leave") {
      beep(659.25, 0, 0.14, 0.08);
      beep(392, 0.12, 0.28, 0.07);
    } else if (kind === "speak") {
      beep(880, 0, 0.1, 0.04);
    } else if (kind === "mute") {
      beep(440, 0, 0.08, 0.05);
    } else {
      beep(523.25, 0, 0.08, 0.05);
    }
    void ctx.resume();
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio is optional
  }
}
