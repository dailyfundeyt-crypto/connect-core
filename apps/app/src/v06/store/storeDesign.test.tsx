import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { ListingCard } from "./ListingCard";
import { StoreCategoryTabs } from "./StoreCategoryTabs";
import type { StoreListing } from "./types";

const mockListing: StoreListing = {
  id: "test-mcp",
  slug: "test-mcp",
  name: "Test MCP Server",
  version: "1.0.0",
  kind: "mcp",
  authorId: "test-author",
  iconUrl: "",
  screenshots: [],
  summary: "Ein Test-Paket für den Connect Store",
  description: "Ausführliche Beschreibung des Test-Pakets",
  priceCents: 0,
  status: "published",
  installSpec: { permissions: [] },
};

describe("A38 – Store Design V2 Rollout", () => {
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

  it("ListingCard nutzt Obsidian-Surface und Hairline-Border bei designV2", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const html = renderToString(
      <ListingCard
        listing={mockListing}
        onSelect={() => {}}
        onInstall={() => {}}
      />
    );

    expect(html).toContain("var(--p-surface-2)");
    expect(html).toContain("var(--p-border)");
  });

  it("ListingCard hat min-h-[44px] Install-Button für Touch-Ergonomie", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const html = renderToString(
      <ListingCard
        listing={mockListing}
        onSelect={() => {}}
        onInstall={() => {}}
      />
    );

    expect(html).toContain("min-h-[44px]");
  });

  it("ListingCard behält Legacy-Styling wenn designV2 aus ist", () => {
    delete process.env.CONNECT_FLAGS_V06;
    const html = renderToString(
      <ListingCard
        listing={mockListing}
        onSelect={() => {}}
        onInstall={() => {}}
      />
    );

    expect(html).not.toContain("var(--p-surface-2)");
  });

  it("StoreCategoryTabs Pills haben min-h-[44px] bei designV2", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const html = renderToString(
      <StoreCategoryTabs
        selectedKind="all"
        onSelectKind={() => {}}
      />
    );

    expect(html).toContain("min-h-[44px]");
  });
});
