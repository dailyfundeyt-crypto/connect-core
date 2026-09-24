import { describe, expect, test } from "bun:test";
import {
  filterHermesTools,
  HERMES_DEFAULT_TOOL_ALLOWLIST,
  isHermesAllowedTool,
} from "./hermes-profile";

describe("Hermes tool allowlist", () => {
  test("allows default computer and plan tools", () => {
    expect(isHermesAllowedTool("hermes_plan")).toBe(true);
    expect(isHermesAllowedTool("computer_run_command")).toBe(true);
    expect(isHermesAllowedTool("computer_navigate")).toBe(true);
  });

  test("refuses unknown bare tool names", () => {
    expect(isHermesAllowedTool("rm_rf_everything")).toBe(false);
    expect(isHermesAllowedTool("")).toBe(false);
  });

  test("passes through MCP-style tool names", () => {
    expect(isHermesAllowedTool("slack/send_message")).toBe(true);
    expect(isHermesAllowedTool("mcp__gmail__send_email")).toBe(true);
  });

  test("respects a custom allowlist", () => {
    expect(isHermesAllowedTool("computer_run_command", ["hermes_plan"])).toBe(
      false,
    );
    expect(isHermesAllowedTool("hermes_plan", ["hermes_plan"])).toBe(true);
  });

  test("filters descriptor lists", () => {
    const kept = filterHermesTools([
      { name: "hermes_plan" },
      { name: "rm_rf_everything" },
      { name: "gmail/send" },
    ]);
    expect(kept.map((t) => t.name)).toEqual(["hermes_plan", "gmail/send"]);
  });

  test("default list is non-empty and includes the plan tool", () => {
    expect(HERMES_DEFAULT_TOOL_ALLOWLIST.length).toBeGreaterThan(5);
    expect(HERMES_DEFAULT_TOOL_ALLOWLIST).toContain("hermes_plan");
  });
});
