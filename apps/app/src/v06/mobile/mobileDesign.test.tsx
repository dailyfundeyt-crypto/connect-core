import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { CompanyAppsView } from "./CompanyAppsView";
import { CompanyBrowserView } from "./CompanyBrowserView";

describe("A38 – Mobile Design V2 Rollout", () => {
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

  it("CompanyAppsView rendert mit Design-Tokens und Touch-Zielen wenn designV2 aktiv ist", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const mockCompany = {
      id: "flux",
      name: "Flux Corp",
      urls: { "flux-app": "https://example.com/app" },
    };

    const html = renderToString(
      <CompanyAppsView activeCompany={mockCompany as any} onOpenApp={() => {}} />
    );

    expect(html).toContain("min-h-[56px]");
    expect(html).toContain("var(--p-surface-2)");
  });

  it("CompanyAppsView behält Standard-Styling wenn designV2 inaktiv ist", () => {
    delete process.env.CONNECT_FLAGS_V06;
    const mockCompany = {
      id: "flux",
      name: "Flux Corp",
      urls: { "flux-app": "https://example.com/app" },
    };

    const html = renderToString(
      <CompanyAppsView activeCompany={mockCompany as any} onOpenApp={() => {}} />
    );

    expect(html).not.toContain("var(--p-surface-2)");
  });

  it("CompanyBrowserView rendert min-h-[44px] Touch-Ziele bei designV2", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const mockCompany = {
      id: "flux",
      name: "Flux Corp",
      urls: {
        "flux-app": "https://example.com/app",
        "wiki": "https://example.com/wiki",
      },
    };

    const mockSections = [
      {
        id: "sec-1",
        title: "Test Gruppe",
        rows: [
        {
          key: "row-1",
          title: "Test Row",
          subtitle: "example.com",
          url: "https://example.com/row",
          sources: [],
        },
        ],
      },
    ];

    const html = renderToString(
      <CompanyBrowserView
        activeCompany={mockCompany as any}
        sections={mockSections}
        collapsed={{}}
        onToggleSection={() => {}}
        onOpenRow={() => {}}
      />
    );

    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("var(--p-surface-2)");
  });
});
