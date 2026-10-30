import { describe, expect, test } from "bun:test";
import {
  type CloudTask,
  draftFromTask,
  draftToInput,
  emptyTaskDraft,
  formatRunTime,
  scheduleLabel,
  taskStatusLabel,
} from "./cloud-tasks";

describe("cloud task helpers", () => {
  test("draftToInput builds every schedule kind and refuses gaps", () => {
    const base = { ...emptyTaskDraft(new Date("2026-10-28T10:00:00Z")), title: " Dusty ", prompt: " Bericht " };
    expect(base.date).toBe("2026-10-29");
    expect(draftToInput({ ...base, kind: "daily", time: "13:00" })).toEqual({
      ok: true,
      input: { title: "Dusty", prompt: "Bericht", schedule: { kind: "daily", time: "13:00" } },
    });
    expect(draftToInput({ ...base, kind: "weekly", time: "08:30", weekday: 5 })).toMatchObject({
      input: { schedule: { kind: "weekly", time: "08:30", weekday: 5 } },
    });
    expect(draftToInput({ ...base, kind: "once", date: "2026-12-24", time: "18:00" })).toMatchObject({
      input: { schedule: { kind: "once", at: "2026-12-24T18:00" } },
    });
    expect(draftToInput({ ...base, title: "" })).toEqual({ ok: false, error: "Titel fehlt" });
    expect(draftToInput({ ...base, prompt: " " })).toEqual({ ok: false, error: "Prompt fehlt" });
    expect(draftToInput({ ...base, time: "" })).toEqual({ ok: false, error: "Uhrzeit fehlt" });
  });

  test("labels are German", () => {
    expect(scheduleLabel({ kind: "daily", time: "13:00" })).toBe("Täglich 13:00 Uhr");
    expect(scheduleLabel({ kind: "weekdays", time: "09:00" })).toBe("Werktags (Mo–Fr) 09:00 Uhr");
    expect(scheduleLabel({ kind: "weekly", time: "09:00", weekday: 1 })).toBe("Jeden Montag 09:00 Uhr");
    expect(scheduleLabel({ kind: "once", at: "2026-12-24T18:00" })).toBe("Einmalig am 24.12.2026, 18:00 Uhr");
    expect(taskStatusLabel("missed")).toBe("verpasst");
    expect(taskStatusLabel(undefined)).toBe("noch nie gelaufen");
  });

  test("formatRunTime uses Berlin time incl. DST", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(formatRunTime("2026-10-28T12:00:00Z", "Europe/Berlin", now)).toBe("heute 13:00");
    expect(formatRunTime("2026-10-29T12:00:00Z", "Europe/Berlin", now)).toBe("morgen 13:00");
    expect(formatRunTime(null)).toBe("—");
  });

  test("draftFromTask round-trips", () => {
    const task = {
      title: "T",
      prompt: "P",
      schedule: { kind: "weekly", time: "07:15", weekday: 3 },
    } as CloudTask;
    expect(draftToInput(draftFromTask(task))).toMatchObject({ input: { schedule: task.schedule } });
  });
});
