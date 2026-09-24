import { describe, expect, test } from "bun:test";
import { COMPUTER_GUIDANCE, HERMES_GUIDANCE } from "./bot-prompt";

describe("COMPUTER_GUIDANCE", () => {
  test("keeps paragraph breaks as blank lines instead of collapsing them into spaces", () => {
    expect(COMPUTER_GUIDANCE).toContain("\n\n");
    expect(COMPUTER_GUIDANCE).not.toContain("  ");
  });

  test("keeps each paragraph as one unbroken line of prose", () => {
    for (const paragraph of COMPUTER_GUIDANCE.split("\n\n")) {
      expect(paragraph).not.toContain("\n");
      expect(paragraph.length).toBeGreaterThan(0);
    }
  });

  test("still contains the full instruction text, unchanged in wording", () => {
    expect(COMPUTER_GUIDANCE).toContain(
      "You are a Bot with your own computer, a real web browser the person can watch you use.",
    );
    expect(COMPUTER_GUIDANCE).toContain(
      "Say what you found or did in plain language, briefly.",
    );
  });
});

describe("HERMES_GUIDANCE", () => {
  test("keeps paragraph breaks and names the plan tool", () => {
    expect(HERMES_GUIDANCE).toContain("\n\n");
    expect(HERMES_GUIDANCE).toContain("hermes_plan");
    expect(HERMES_GUIDANCE).toContain("interrupts");
  });

  test("keeps each paragraph as one unbroken line of prose", () => {
    for (const paragraph of HERMES_GUIDANCE.split("\n\n")) {
      expect(paragraph).not.toContain("\n");
      expect(paragraph.length).toBeGreaterThan(0);
    }
  });
});
