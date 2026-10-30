import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  colors,
  radii,
  spacing,
  typography,
  shadows,
  motionTokens,
  cssVars,
} from "../src/v06/design/tokens";
import { MOTION, safeTransition } from "../src/v06/design/motion";
import { Button } from "../src/v06/design/Button";
import { IconButton } from "../src/v06/design/IconButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../src/v06/design/Card";
import { ListRow } from "../src/v06/design/ListRow";
import { Toggle } from "../src/v06/design/Toggle";
import { SegmentedControl } from "../src/v06/design/SegmentedControl";
import { SidebarSection } from "../src/v06/design/SidebarSection";
import { EmptyState } from "../src/v06/design/EmptyState";
import { Skeleton } from "../src/v06/design/Skeleton";
import { ParticlesBackground } from "../src/v06/design/ParticlesBackground";
import { ToastItem, type ToastMessage } from "../src/v06/design/Toast";
import { DesignPreviewPage } from "../src/v06/design/DesignPreviewPage";

describe("v06 Design System: Tokens", () => {
  test("dark palette has essential Obsidian roles", () => {
    expect(colors.dark.bg).toBe("#09090b");
    expect(colors.dark.surface1).toBe("#121216");
    expect(colors.dark.surface2).toBe("#18181e");
    expect(colors.dark.surface3).toBe("#22222a");
    expect(colors.dark.accent).toBe("#38bdf8");
    expect(colors.dark.border).toBeDefined();
    expect(colors.dark.text1).toBeDefined();
  });

  test("light palette provides distinct clean contrast", () => {
    expect(colors.light.bg).toBe("#f9fafb");
    expect(colors.light.surface2).toBe("#ffffff");
    expect(colors.light.accent).toBe("#0284c7");
    expect(colors.light.text1).toBe("#0f172a");
  });

  test("radii enforce consistent rounding scale", () => {
    expect(radii.xs).toBe("4px");
    expect(radii.sm).toBe("6px");
    expect(radii.md).toBe("10px");
    expect(radii.lg).toBe("14px");
    expect(radii.full).toBe("9999px");
  });

  test("spacing raster is strictly 4/8-pixel grid", () => {
    expect(spacing[1]).toBe("4px");
    expect(spacing[2]).toBe("8px");
    expect(spacing[3]).toBe("12px");
    expect(spacing[4]).toBe("16px");
    expect(spacing[6]).toBe("24px");
    expect(spacing[8]).toBe("32px");
  });

  test("motion timing bounds strictly between 120ms and 260ms", () => {
    expect(MOTION.durationMs.fast).toBe(120);
    expect(MOTION.durationMs.base).toBe(180);
    expect(MOTION.durationMs.slow).toBe(260);
    expect(safeTransition(0.18, true).duration).toBe(0);
    expect(safeTransition(0.18, false).duration).toBe(0.18);
  });
});

describe("v06 Design System: Button", () => {
  test("renders primary button with accent styling", () => {
    const html = renderToString(<Button variant="primary">Klick mich</Button>);
    expect(html).toContain("Klick mich");
    expect(html).toContain("bg-[var(--p-accent)]");
    expect(html).toContain("text-[var(--p-text-on-accent)]");
  });

  test("renders secondary button with hairline border", () => {
    const html = renderToString(<Button variant="secondary">Abbrechen</Button>);
    expect(html).toContain("bg-[var(--p-surface-2)]");
    expect(html).toContain("border-[var(--p-border)]");
  });

  test("handles loading state with aria-busy and spinner", () => {
    const html = renderToString(<Button loading>Speichern</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  test("handles disabled state", () => {
    const html = renderToString(<Button disabled>Deaktiviert</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-40");
  });
});

describe("v06 Design System: IconButton", () => {
  test("renders with mandatory aria-label", () => {
    const html = renderToString(
      <IconButton aria-label="Schließen" icon={<span>X</span>} />,
    );
    expect(html).toContain('aria-label="Schließen"');
  });

  test("supports active toggle state", () => {
    const html = renderToString(
      <IconButton aria-label="Pin" active icon={<span>Pin</span>} />,
    );
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("v06 Design System: Card", () => {
  test("renders raised card with header, title and content", () => {
    const html = renderToString(
      <Card elevation="raised">
        <CardHeader>
          <CardTitle>Agent Status</CardTitle>
          <CardDescription>Hintergrund</CardDescription>
        </CardHeader>
        <CardContent>Inhalt</CardContent>
      </Card>,
    );
    expect(html).toContain("Agent Status");
    expect(html).toContain("Hintergrund");
    expect(html).toContain("bg-[var(--p-surface-2)]");
  });

  test("interactive card includes hover elevation classes", () => {
    const html = renderToString(
      <Card interactive>
        <CardContent>Klickbare Karte</CardContent>
      </Card>,
    );
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("hover:border-[var(--p-border-strong)]");
  });
});

describe("v06 Design System: ListRow", () => {
  test("renders row with title, status and badge", () => {
    const html = renderToString(
      <ListRow
        title="Helium Bot"
        subtitle="Orchestrator"
        status="online"
        badge="v06"
        clickable
      />,
    );
    expect(html).toContain("Helium Bot");
    expect(html).toContain("Orchestrator");
    expect(html).toContain("v06");
    expect(html).toContain('role="button"');
  });
});

describe("v06 Design System: Toggle", () => {
  test("renders switch with accessibility attributes", () => {
    const html = renderToString(
      <Toggle
        checked={true}
        label="Dark Mode erzwingen"
        description="Immer aktiv"
      />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Dark Mode erzwingen");
  });

  test("handles unchecked state", () => {
    const html = renderToString(<Toggle checked={false} label="Aktivieren" />);
    expect(html).toContain('aria-checked="false"');
  });
});

describe("v06 Design System: SegmentedControl", () => {
  test("renders tablist with selected tab", () => {
    const html = renderToString(
      <SegmentedControl
        value="active"
        onChange={() => {}}
        items={[
          { value: "all", label: "Alle" },
          { value: "active", label: "Aktiv", badge: 3 },
        ]}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Aktiv");
    expect(html).toContain("3");
  });
});

describe("v06 Design System: SidebarSection", () => {
  test("renders section with title, badge and content", () => {
    const html = renderToString(
      <SidebarSection title="Favoriten" badge={5} collapsible>
        <div>Item 1</div>
      </SidebarSection>,
    );
    expect(html).toContain("Favoriten");
    expect(html).toContain("5");
    expect(html).toContain("Item 1");
  });
});

describe("v06 Design System: EmptyState & Skeleton", () => {
  test("renders EmptyState with icon and action", () => {
    const html = renderToString(
      <EmptyState
        icon={<span>Icon</span>}
        title="Leer"
        description="Keine Elemente vorhanden"
        action={<Button>Neu anlegen</Button>}
      />,
    );
    expect(html).toContain("Leer");
    expect(html).toContain("Keine Elemente vorhanden");
    expect(html).toContain("Neu anlegen");
  });

  test("renders Skeleton with shimmer and accessible role", () => {
    const html = renderToString(<Skeleton variant="rect" height={50} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Lädt..."');
    expect(html).toContain("animate-pulse");
  });
});

describe("v06 Design System: ParticlesBackground", () => {
  test("renders canvas element with accessibility aria-hidden attribute", () => {
    const html = renderToString(<ParticlesBackground density={20} />);
    expect(html).toContain("<canvas");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
  });
});

describe("v06 Design System: ToastItem", () => {
  test("renders toast with variant styling", () => {
    const toast: ToastMessage = {
      id: "test-1",
      title: "Gespeichert",
      description: "Erfolgreich übernommen",
      variant: "success",
    };
    const html = renderToString(<ToastItem toast={toast} onDismiss={() => {}} />);
    expect(html).toContain("Gespeichert");
    expect(html).toContain("Erfolgreich übernommen");
    expect(html).toContain("border-l-[var(--p-success)]");
  });
});

describe("v06 Design System: DesignPreviewPage", () => {
  test("renders preview page without throwing and writes HTML preview snapshots", () => {
    process.env.CONNECT_FLAGS_V06 = "designV2";
    const html = renderToString(<DesignPreviewPage />);
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(100);

    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const os = require("node:os");

      const tokensCss = fs.readFileSync(
        path.resolve(__dirname, "../src/v06/design/tokens.css"),
        "utf-8",
      );

      const tempDir = os.tmpdir();
      const appCheckDir = path.join(tempDir, "connect-appcheck-A26", "assets");
      if (fs.existsSync(appCheckDir)) {
        const files = fs.readdirSync(appCheckDir);
        const mainCssFile = files.find(
          (f: string) => f.startsWith("index-") && f.endsWith(".css"),
        );
        const mainCss = mainCssFile
          ? fs.readFileSync(path.join(appCheckDir, mainCssFile), "utf-8")
          : "";

        const createFullHtml = (theme: "dark" | "light") => `<!DOCTYPE html>
<html lang="de" class="${theme}" data-theme="${theme}" style="color-scheme: ${theme};">
<head>
  <meta charset="utf-8">
  <title>Connect Premium Design System (${theme})</title>
  <style>
    ${tokensCss}
    ${mainCss}
    body {
      margin: 0;
      padding: 0;
      background: var(--p-bg);
      color: var(--p-text-1);
      font-family: var(--p-font-sans);
    }
  </style>
</head>
<body class="${theme} p-theme-${theme}">
  ${html}
</body>
</html>`;

        fs.writeFileSync(path.join(tempDir, "preview-dark.html"), createFullHtml("dark"));
        fs.writeFileSync(path.join(tempDir, "preview-light.html"), createFullHtml("light"));
      }
    } catch (e) {
      // preview snapshot export is best-effort
    }
  });
});
