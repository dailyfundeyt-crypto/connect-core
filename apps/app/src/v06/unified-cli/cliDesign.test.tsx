import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { SwitchProgress, BrokerNotice } from "./SwitchProgress";
import { CliSourceBadge } from "./CliSourceBadge";
import { LiveControlToggle } from "../live-preview/liveControlToggle";
import { ControlToggle } from "@/components/control-toggle";

describe("A37 – Design-Rollout „Premium“ Chat/CLI & Live-Preview Tests (v06)", () => {
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

  test("1. ProviderSwitcher: rendert mit Obsidian-Tokens und Hairline-Borders wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <ProviderSwitcher
        state={{ committed: "antigravity", pending: null, busy: false, error: null }}
        onChange={() => {}}
      />
    );

    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border)]");
    expect(html).toContain("text-[var(--p-text-1)]");
    expect(html).not.toContain("bg-[#181922]");
  });

  test("2. ProviderSwitcher: behaelt Original-Styling wenn designV2 inaktiv (Flag aus = alt)", () => {
    delete process.env.CONNECT_FLAGS_V06;

    const html = renderToString(
      <ProviderSwitcher
        state={{ committed: "antigravity", pending: null, busy: false, error: null }}
        onChange={() => {}}
      />
    );

    expect(html).toContain("bg-[#181922]");
    expect(html).not.toContain("bg-[var(--p-surface-2)]");
  });

  test("3. SwitchProgress & BrokerNotice: Premium Tokens wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const progressHtml = renderToString(
      <SwitchProgress busy={true} pending="codex" />
    );
    expect(progressHtml).toContain("bg-[var(--p-surface-2)]");
    expect(progressHtml).toContain("border-[var(--p-border)]");

    const noticeHtml = renderToString(
      <BrokerNotice visible={true} />
    );
    expect(noticeHtml).toContain("border-amber-500/25");
    expect(noticeHtml).toContain("text-[var(--p-accent)]");
  });

  test("4. CliSourceBadge: rendert Micro-Badge mit Hairline-Border wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <CliSourceBadge source="cli" />
    );

    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border)]");
    expect(html).toContain("CLI");
  });

  test("5. LiveControlToggle: rendert Obsidian Pill mit Hairline-Border wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <LiveControlToggle
        control={false}
        takeControl={() => {}}
        releaseControl={() => {}}
      />
    );

    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border)]");
    expect(html).toContain("bg-[var(--p-surface-3)]");
  });

  test("6. LiveControlToggle: behaelt Legacy-Pille wenn designV2 inaktiv", () => {
    delete process.env.CONNECT_FLAGS_V06;

    const html = renderToString(
      <LiveControlToggle
        control={false}
        takeControl={() => {}}
        releaseControl={() => {}}
      />
    );

    expect(html).toContain("border-white/10");
    expect(html).toContain("bg-white/[0.04]");
    expect(html).not.toContain("bg-[var(--p-surface-2)]");
  });

  test("7. ControlToggle: nutzt Obsidian Tokens und sanfte Micro-Transitions wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <ControlToggle active={false} />
    );

    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border)]");
  });
});
