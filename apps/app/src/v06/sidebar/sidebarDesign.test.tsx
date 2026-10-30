import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { SidebarSectionOrder } from "./SidebarSectionOrder";
import { AppsSectionV06 } from "./AppsSectionV06";
import { CompanySwitcherV06 } from "./CompanySwitcherV06";
import { ConfirmHardDeleteDialog } from "./ConfirmHardDeleteDialog";
import { ToolsMenuV2 } from "../company-tools/ToolsMenuV2";
import { SidebarSection, ListRow, EmptyState } from "@/v06/design";

describe("A34 – Design-Rollout „Premium“ Sidebar Tests (v06)", () => {
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

  test("1. SidebarSectionOrder: rendert Hairline-Borders und Obsidian-Tokens wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <SidebarSectionOrder
        header={<div data-testid="hdr">Header</div>}
        apps={<div data-testid="apps">Apps</div>}
        folders={<div data-testid="fld">Folders</div>}
        unfiled={<div data-testid="unf">Unfiled</div>}
        tools={<div data-testid="tls">Tools</div>}
        profile={<div data-testid="prf">Profile</div>}
      />,
    );

    expect(html).toContain("bg-[var(--p-bg)]");
    expect(html).toContain("text-[var(--p-text-1)]");
    expect(html).toContain("bg-[var(--p-border-subtle)]");
  });

  test("2. SidebarSectionOrder: behaelt Original-Styling wenn designV2 inaktiv (Flag aus = alt)", () => {
    delete process.env.CONNECT_FLAGS_V06;

    const html = renderToString(
      <SidebarSectionOrder
        header={<div data-testid="hdr">Header</div>}
        apps={<div data-testid="apps">Apps</div>}
        folders={<div data-testid="fld">Folders</div>}
        unfiled={<div data-testid="unf">Unfiled</div>}
        tools={<div data-testid="tls">Tools</div>}
        profile={<div data-testid="prf">Profile</div>}
      />,
    );

    expect(html).toContain("bg-sidebar-border/40");
    expect(html).not.toContain("bg-[var(--p-bg)]");
  });

  test("3. SidebarSection & ListRow: Integration verifiziert korrekte CSS-Token-Klassen", () => {
    const html = renderToString(
      <SidebarSection title="TEST APPS" badge={3} collapsible defaultExpanded>
        <ListRow
          title="Codex Desktop"
          subtitle="CLI / Desktop"
          leftAccessory={<div className="size-6 bg-emerald-500 rounded" />}
          status="online"
          badge="1 Acc"
          compact
          clickable
        />
      </SidebarSection>,
    );

    expect(html).toContain("TEST APPS");
    expect(html).toContain("3");
    expect(html).toContain("Codex Desktop");
    expect(html).toContain("CLI / Desktop");
    expect(html).toContain("bg-[var(--p-success)]");
    expect(html).toContain("var(--p-text-3)");
  });

  test("4. ConfirmHardDeleteDialog: rendert mit Obsidian-Tokens und Hairline-Borders wenn designV2 aktiv", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";

    const html = renderToString(
      <ConfirmHardDeleteDialog
        open={true}
        onOpenChange={() => {}}
        botId="bot-123"
        botName="PremiumBot"
        onConfirm={async () => {}}
      />,
    );

    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border-strong)]");
    expect(html).toContain("text-[var(--p-danger)]");
    expect(html).toContain("unwiderruflich, vorher wird ein JSON-Export erstellt");
    expect(html).toContain("PremiumBot");
  });

  test("5. EmptyState & Skeleton: Leere Zustaende in der Sidebar bieten hochwertige UX", () => {
    const html = renderToString(
      <EmptyState
        icon={<div data-testid="empty-icon">Icon</div>}
        compact
        title="Keine Bots ohne Ordner"
        description="Alle Bots sind Ordnern zugewiesen."
      />,
    );

    expect(html).toContain("Keine Bots ohne Ordner");
    expect(html).toContain("Alle Bots sind Ordnern zugewiesen.");
    expect(html).toContain("var(--p-surface-2)");
  });
});
