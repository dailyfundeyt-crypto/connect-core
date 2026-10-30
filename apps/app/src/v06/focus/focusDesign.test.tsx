import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { FocusChain } from "@/components/focus/focus-chain";

describe("A37 – Design-Rollout „Premium“ Focus Chain Tests (v06)", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  beforeEach(() => {
    delete process.env.CONNECT_FLAGS_V06;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnv;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  test("1. FocusChain: rendert mit Obsidian-Tokens und Hairline-Borders wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "focusV2,designV2";

    const html = renderToString(<FocusChain />);

    expect(html).toContain("var(--p-border)");
    expect(html).toContain("var(--p-surface-2)");
    expect(html).toContain("var(--p-text-1)");
  });

  test("2. FocusChain: behaelt Legacy-Styling wenn designV2 inaktiv (Flag aus = alt)", () => {
    process.env.CONNECT_FLAGS_V06 = "focusV2";

    const html = renderToString(<FocusChain />);

    expect(html).toContain("border-white/15");
    expect(html).not.toContain("var(--p-surface-2)");
  });
});
