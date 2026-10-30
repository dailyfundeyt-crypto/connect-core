/** Handy-Kopplung — Tests der Ablaufanzeige (Lane A34). */

import { describe, expect, test } from "bun:test";
import { formatCountdown, formatTime, secondsUntil } from "./format";

const NOW = Date.parse("2026-10-29T10:00:00.000Z");

describe("secondsUntil", () => {
  test("zählt bis zum Ablauf und bleibt bei 0 stehen", () => {
    expect(secondsUntil("2026-10-29T10:05:00.000Z", NOW)).toBe(300);
    expect(secondsUntil("2026-10-29T10:04:59.200Z", NOW)).toBe(300);
    expect(secondsUntil("2026-10-29T10:00:00.000Z", NOW)).toBe(0);
    expect(secondsUntil("2026-10-29T09:59:00.000Z", NOW)).toBe(0);
  });

  test("ungültige Zeitstempel ergeben 0", () => {
    expect(secondsUntil("keine-zeit", NOW)).toBe(0);
  });
});

describe("formatCountdown", () => {
  test("formatiert mm:ss", () => {
    expect(formatCountdown(300)).toBe("05:00");
    expect(formatCountdown(59)).toBe("00:59");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5)).toBe("00:00");
  });
});

describe("formatTime", () => {
  test("leere und ungültige Werte bleiben Strich", () => {
    expect(formatTime(null)).toBe("–");
    expect(formatTime("keine-zeit")).toBe("–");
  });
});
