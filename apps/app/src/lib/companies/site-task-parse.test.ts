import { describe, expect, test } from "bun:test";
import {
  highlightSiteTask,
  parseSiteTaskAssignments,
} from "@/lib/companies/site-task-parse";

const agents = [
  { id: "a1", name: "Grok" },
  { id: "a2", name: "Claude" },
];

describe("parseSiteTaskAssignments", () => {
  test("whole draft goes to primary", () => {
    const out = parseSiteTaskAssignments(
      "Bitte Login prüfen",
      agents,
      "a1",
    );
    expect(out).toEqual([
      {
        agentId: "a1",
        task: "Bitte Login prüfen",
        color: "blue",
        primary: true,
      },
    ]);
  });

  test("@Agent quote goes to that agent; rest to primary", () => {
    const out = parseSiteTaskAssignments(
      'Haupttext hier @Claude "Fülle das Formular" und weiter',
      agents,
      "a1",
    );
    const claude = out.find((a) => a.agentId === "a2");
    const grok = out.find((a) => a.agentId === "a1");
    expect(claude?.task).toBe("Fülle das Formular");
    expect(claude?.color).toBe("red");
    expect(grok?.task).toContain("Haupttext");
    expect(grok?.primary).toBe(true);
  });

  test("highlights alternate red and blue on mentions", () => {
    const segs = highlightSiteTask(
      '@Grok "eins" @Claude "zwei"',
      agents,
    );
    const mentions = segs.filter((s) => s.kind === "mention");
    expect(mentions[0]?.color).toBe("red");
    expect(mentions[1]?.color).toBe("blue");
    const quotes = segs.filter((s) => s.kind === "quote");
    expect(quotes[0]?.color).toBe("red");
    expect(quotes[1]?.color).toBe("blue");
  });
});
