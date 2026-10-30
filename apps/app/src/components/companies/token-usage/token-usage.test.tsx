/**
 * Token-Verbrauch-Widget im Firmenprofil — Tests (Lane A35).
 *
 * Deckt die Akzeptanzkriterien ab:
 *  1. Render-Tests: öffentlich / privat / leer.
 *  2. Allowlist: Das Widget zeigt nur freigegebene Summenfelder (keine Prompts, Keys, Agenten).
 *  3. Kosten nur nach Freigabe (`showCost` bzw. `costUsd` aus A20).
 *  4. Kleine Verlaufslinie nur aus echten Tageswerten.
 *  5. Admin-Schalter „Öffentlich anzeigen“ + „Kosten zeigen“ mit Erklärung.
 *  6. Feature-Flag `companyPublicUsage`: Flag aus = kein Widget (altes Profil).
 *
 * Hinweis: Bewusst containergebundene Queries (`render(...).getByText`) statt `screen`.
 * `screen` bindet `document.body` beim Modul-Import; in dieser Suite wird das DOM aber erst
 * durch `ensureDom()` registriert.
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  buildSparklinePath,
  type CompanyPublicUsage,
  CompanyTokenUsageSection,
  type CompanyUsageSettings,
  formatComputedAt,
  formatCostUsd,
  formatTokenAmount,
  formatWindowLabel,
  formatWindowPhrase,
  PUBLIC_USAGE_ALLOWLIST,
  providerLabel,
  providerShares,
  resetTokenUsageMock,
  setMockVisibility,
  TokenUsageAdminControls,
  TokenUsageWidget,
  toPublicUsage,
  toVisibilitySettings,
} from "./index";

const COMPANY_ID = "nordwind";

const PUBLIC_USAGE: CompanyPublicUsage = {
  companyId: COMPANY_ID,
  windowDays: 30,
  totalTokens: 12_437_000,
  costUsd: 41.87,
  byProvider: [
    { provider: "codex", tokens: 7_210_000 },
    { provider: "claudeAgent", tokens: 4_090_000 },
    { provider: "cursor", tokens: 1_137_000 },
  ],
  computedAt: "2026-10-29T12:00:00.000Z",
};

const SETTINGS: CompanyUsageSettings = {
  companyId: COMPANY_ID,
  public: true,
  showCost: false,
};

function setFlags(flags: Partial<Record<string, boolean>>): void {
  (
    window as typeof window & { __CONNECT_FLAGS_T3?: Record<string, boolean> }
  ).__CONNECT_FLAGS_T3 = flags as Record<string, boolean>;
}

function clearFlags(): void {
  delete (window as typeof window & { __CONNECT_FLAGS_T3?: unknown })
    .__CONNECT_FLAGS_T3;
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

beforeEach(() => {
  resetTokenUsageMock();
  clearFlags();
});

afterEach(() => {
  cleanup();
  clearFlags();
});

/* ---------------------------------------------------------------------------------------- */

describe("Formatierung (deutsch)", () => {
  it("zeigt 12 400 000 Tokens als 12,4 Mio. Tokens", () => {
    const amount = formatTokenAmount(12_400_000);
    expect(amount.value).toBe("12,4");
    expect(amount.unit).toBe("Mio. Tokens");
    expect(amount.full).toBe("12.400.000 Tokens");
  });

  it("zeigt Tausender mit Punkt und kleine Werte ohne Einheit", () => {
    expect(formatTokenAmount(8_420).value).toBe("8.420");
    expect(formatTokenAmount(8_420).unit).toBe("Tokens");
    expect(formatTokenAmount(0).value).toBe("0");
    expect(formatTokenAmount(-5).value).toBe("0");
    expect(formatTokenAmount(Number.NaN).full).toBe("0 Tokens");
  });

  it("zeigt Milliarden als Mrd. Tokens", () => {
    const amount = formatTokenAmount(1_250_000_000);
    expect(amount.value).toBe("1,3");
    expect(amount.unit).toBe("Mrd. Tokens");
  });

  it("formatiert Kosten in USD mit Komma", () => {
    expect(formatCostUsd(41.87)).toContain("41,87");
    expect(formatCostUsd(0)).toContain("0,00");
  });

  it("formatiert Zeitraum und Stand auf Deutsch", () => {
    expect(formatWindowLabel(30)).toBe("Letzte 30 Tage");
    expect(formatWindowLabel(1)).toBe("Letzter Tag");
    expect(formatWindowPhrase(30)).toBe("in den letzten 30 Tagen");
    expect(formatWindowPhrase(1)).toBe("im letzten Tag");
    expect(formatComputedAt("2026-10-29T12:00:00.000Z")).toBe("29.10.2026");
    expect(formatComputedAt("")).toBe("");
    expect(formatComputedAt("kein-datum")).toBe("");
  });

  it("benennt bekannte CLIs und fällt bei unbekannten sauber zurück", () => {
    expect(providerLabel("codex")).toBe("Codex");
    expect(providerLabel("claudeAgent")).toBe("Claude");
    expect(providerLabel("custom-cli")).toBe("Custom cli");
    expect(providerLabel("")).toBe("Unbekannt");
  });
});

describe("Anteile je CLI", () => {
  it("sortiert absteigend und rechnet Prozentanteile", () => {
    const shares = providerShares(PUBLIC_USAGE.byProvider);
    expect(shares.map((entry) => entry.provider)).toEqual([
      "codex",
      "claudeAgent",
      "cursor",
    ]);
    expect(shares[0]?.percentLabel).toBe("58 %");
    const total = shares.reduce((sum, entry) => sum + entry.share, 0);
    expect(Math.round(total * 1000) / 1000).toBe(1);
  });

  it("fasst kleine Reste zu „Weitere“ zusammen", () => {
    const shares = providerShares(
      [
        { provider: "a", tokens: 50 },
        { provider: "b", tokens: 40 },
        { provider: "c", tokens: 30 },
        { provider: "d", tokens: 20 },
        { provider: "e", tokens: 10 },
      ],
      4,
    );
    expect(shares).toHaveLength(5);
    expect(shares[4]?.provider).toBe("other");
    expect(shares[4]?.label).toBe("Weitere");
    expect(shares[4]?.tokens).toBe(10);
  });

  it("ignoriert leere und negative Einträge", () => {
    expect(providerShares([])).toEqual([]);
    expect(
      providerShares([
        { provider: "", tokens: 100 },
        { provider: "codex", tokens: -1 },
        { provider: "claudeAgent", tokens: Number.NaN },
      ]),
    ).toEqual([]);
  });
});

describe("Verlaufslinie", () => {
  it("baut aus Tageswerten einen SVG-Pfad", () => {
    const geometry = buildSparklinePath([
      { day: "2026-10-27", tokens: 10 },
      { day: "2026-10-28", tokens: 30 },
      { day: "2026-10-29", tokens: 20 },
    ]);
    expect(geometry).not.toBeNull();
    expect(geometry?.line.startsWith("M")).toBe(true);
    expect(geometry?.line.includes("L")).toBe(true);
    expect(geometry?.area.endsWith("Z")).toBe(true);
    expect(geometry?.line.includes("NaN")).toBe(false);
  });

  it("zeichnet ohne zwei Tageswerte keine Linie (keine erfundenen Daten)", () => {
    expect(buildSparklinePath([])).toBeNull();
    expect(buildSparklinePath([{ day: "2026-10-29", tokens: 5 }])).toBeNull();
  });

  it("bleibt bei konstanten Werten eine flache Linie", () => {
    const geometry = buildSparklinePath([
      { day: "2026-10-28", tokens: 5 },
      { day: "2026-10-29", tokens: 5 },
    ]);
    expect(geometry?.line).toBe("M3,16 L117,16");
  });
});

describe("Allowlist & Datenschutz", () => {
  it("behält aus einer rohen Antwort ausschließlich Allowlist-Felder", () => {
    const raw = {
      ...PUBLIC_USAGE,
      prompt: "GEHEIMER PROMPT",
      apiKey: "sk-live-geheim",
      agentNames: ["agent-geheim"],
      userId: "user-42",
      fileName: "kunde.csv",
    };
    const filtered = toPublicUsage(raw);
    expect(filtered).not.toBeNull();
    expect(Object.keys(filtered ?? {}).sort()).toEqual(
      [...PUBLIC_USAGE_ALLOWLIST].sort(),
    );
    expect(JSON.stringify(filtered)).not.toContain("GEHEIMER PROMPT");
    expect(JSON.stringify(filtered)).not.toContain("sk-live-geheim");
    expect(JSON.stringify(filtered)).not.toContain("agent-geheim");
  });

  it("verwirft unbrauchbare Provider-Zeilen", () => {
    const filtered = toPublicUsage({
      companyId: COMPANY_ID,
      windowDays: 30,
      totalTokens: 100,
      byProvider: [
        { provider: "codex", tokens: 60 },
        { provider: "", tokens: 20 },
        { provider: "cursor", tokens: -2 },
        { provider: "grok" },
        { provider: "claudeAgent", tokens: 40, costUsd: 1.5 },
      ],
      computedAt: "2026-10-29T12:00:00.000Z",
    });
    expect(filtered?.byProvider).toEqual([
      { provider: "codex", tokens: 60 },
      { provider: "claudeAgent", tokens: 40, costUsd: 1.5 },
    ]);
  });

  it("gibt null zurück, wenn keine Summe enthalten ist", () => {
    expect(toPublicUsage(null)).toBeNull();
    expect(toPublicUsage({ companyId: COMPANY_ID })).toBeNull();
    expect(toPublicUsage({ companyId: "", totalTokens: 10 })).toBeNull();
  });

  it("liest Sichtbarkeit aus GET- und PUT-Antworten", () => {
    expect(
      toVisibilitySettings({ public: false, showCost: true }, COMPANY_ID),
    ).toEqual({ companyId: COMPANY_ID, public: false, showCost: true });
    expect(
      toVisibilitySettings(
        { success: true, settings: { public: true, showCost: true } },
        COMPANY_ID,
      ),
    ).toEqual({ companyId: COMPANY_ID, public: true, showCost: true });
    expect(toVisibilitySettings({ public: true }, COMPANY_ID)).toBeNull();
  });

  it("rendert keine fremden Felder ins DOM", () => {
    const contaminated = {
      ...PUBLIC_USAGE,
      prompt: "GEHEIMER PROMPT",
      apiKey: "sk-live-geheim",
      agentNames: ["agent-geheim"],
      userId: "user-42",
    } as unknown as CompanyPublicUsage;

    render(<TokenUsageWidget forceFlag usage={contaminated} />);

    expect(bodyText()).toContain("12,4");
    expect(bodyText()).not.toContain("GEHEIMER PROMPT");
    expect(bodyText()).not.toContain("sk-live-geheim");
    expect(bodyText()).not.toContain("agent-geheim");
    expect(bodyText()).not.toContain("user-42");
  });
});

describe("Widget: öffentlich", () => {
  it("zeigt große Zahl, Zeitraum, CLI-Anteile, Kosten und Stand", () => {
    const view = render(<TokenUsageWidget forceFlag usage={PUBLIC_USAGE} />);

    const card = view.getByTestId("token-usage-widget");
    expect(card.dataset.state).toBe("ready");
    expect(view.getByText("12,4")).toBeTruthy();
    expect(view.getByText("Mio. Tokens")).toBeTruthy();
    expect(view.getByText("Letzte 30 Tage")).toBeTruthy();
    expect(view.getByText("Token-Verbrauch")).toBeTruthy();
    expect(view.getByText("Codex")).toBeTruthy();
    expect(view.getByText("Claude")).toBeTruthy();
    expect(view.getByText("Cursor")).toBeTruthy();
    expect(view.getByText("58 %")).toBeTruthy();
    expect(view.getByText("41,87 $")).toBeTruthy();
    expect(view.getByText("Nur Summen · keine Inhalte")).toBeTruthy();
    expect(view.getByText("Stand 29.10.2026")).toBeTruthy();
  });

  it("blendet Kosten aus, wenn showCost=false erzwungen wird", () => {
    render(
      <TokenUsageWidget forceFlag showCost={false} usage={PUBLIC_USAGE} />,
    );
    expect(bodyText()).not.toContain("41,87");
  });

  it("blendet CLI-Anteile auf Wunsch aus", () => {
    const view = render(
      <TokenUsageWidget forceFlag showProviders={false} usage={PUBLIC_USAGE} />,
    );
    expect(view.queryByTestId("token-usage-providers")).toBeNull();
  });

  it("zeigt die Verlaufslinie nur mit Tageswerten", () => {
    const withHistory = render(
      <TokenUsageWidget
        forceFlag
        history={[
          { day: "2026-10-27", tokens: 100 },
          { day: "2026-10-28", tokens: 240 },
          { day: "2026-10-29", tokens: 180 },
        ]}
        usage={PUBLIC_USAGE}
      />,
    );
    expect(withHistory.getByRole("img").getAttribute("aria-label")).toContain(
      "Verlauf des Token-Verbrauchs",
    );
    withHistory.unmount();

    const withoutHistory = render(
      <TokenUsageWidget forceFlag usage={PUBLIC_USAGE} />,
    );
    expect(withoutHistory.queryByRole("img")).toBeNull();
  });
});

describe("Widget: privat / leer / Fehler", () => {
  it("zeigt bei Opt-out nur den Hinweis, keine Summe", () => {
    const view = render(
      <TokenUsageWidget forceFlag state="private" usage={null} />,
    );
    const card = view.getByTestId("token-usage-widget");
    expect(card.dataset.state).toBe("private");
    expect(bodyText()).toContain(
      "zeigt ihren Token-Verbrauch nicht öffentlich",
    );
    expect(bodyText()).not.toContain("Mio.");
  });

  it("zeigt bei 0 Tokens einen leeren Zustand statt einer Fake-Zahl", () => {
    const view = render(
      <TokenUsageWidget
        forceFlag
        usage={{ ...PUBLIC_USAGE, totalTokens: 0, byProvider: [] }}
      />,
    );
    const card = view.getByTestId("token-usage-widget");
    expect(card.dataset.state).toBe("empty");
    expect(bodyText()).toContain("Noch keine Tokens in den letzten 30 Tagen.");
    expect(view.queryByTestId("token-usage-providers")).toBeNull();
  });

  it("zeigt bei Ladefehlern keinen Verbrauch", () => {
    render(<TokenUsageWidget forceFlag state="error" usage={null} />);
    expect(bodyText()).toContain("Token-Verbrauch ist gerade nicht verfügbar.");
  });

  it("rendert während des Ladens einen ruhigen Platzhalter", () => {
    const view = render(
      <TokenUsageWidget forceFlag state="loading" usage={null} />,
    );
    expect(view.getByRole("status")).toBeTruthy();
    expect(bodyText()).not.toContain("Mio.");
  });
});

describe("Admin-Schalter", () => {
  it("zeigt beide Schalter und meldet Änderungen", () => {
    const calls: [string, boolean][] = [];
    const view = render(
      <TokenUsageAdminControls
        onToggle={(key, value) => calls.push([key, value])}
        settings={SETTINGS}
      />,
    );

    const publicSwitch = view.getByRole("switch", {
      name: "Öffentlich anzeigen",
    });
    const costSwitch = view.getByRole("switch", { name: "Kosten zeigen" });
    expect(publicSwitch.getAttribute("aria-checked")).toBe("true");
    expect(costSwitch.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(publicSwitch);
    fireEvent.click(costSwitch);
    expect(calls).toEqual([
      ["public", false],
      ["showCost", true],
    ]);
  });

  it("erklärt „nur Summen, keine Inhalte“", () => {
    render(<TokenUsageAdminControls settings={SETTINGS} />);
    expect(bodyText()).toContain("Nur Summen, keine Inhalte");
    expect(bodyText()).toContain("keine Prompts");
  });

  it("sperrt „Kosten zeigen“, solange der Verbrauch privat ist", () => {
    const view = render(
      <TokenUsageAdminControls settings={{ ...SETTINGS, public: false }} />,
    );
    const costSwitch = view.getByRole("switch", {
      name: "Kosten zeigen",
    }) as HTMLButtonElement;
    expect(costSwitch.disabled).toBe(true);
    expect(bodyText()).toContain(
      "Erst möglich, wenn der Verbrauch öffentlich ist.",
    );
  });

  it("rendert für Nicht-Admins nichts", () => {
    const view = render(
      <TokenUsageAdminControls canManage={false} settings={SETTINGS} />,
    );
    expect(view.queryByTestId("token-usage-admin")).toBeNull();
  });
});

describe("Feature-Flag companyPublicUsage", () => {
  it("Flag aus: Widget und Sektion rendern nichts (altes Profil)", () => {
    const widget = render(<TokenUsageWidget usage={PUBLIC_USAGE} />);
    expect(widget.container.firstChild).toBeNull();
    widget.unmount();

    const section = render(
      <CompanyTokenUsageSection companyId={COMPANY_ID} mock />,
    );
    expect(section.container.firstChild).toBeNull();
  });

  it("Flag an: Widget erscheint auch ohne forceFlag", () => {
    setFlags({ companyPublicUsage: true });
    const view = render(<TokenUsageWidget usage={PUBLIC_USAGE} />);
    expect(view.getByTestId("token-usage-widget")).toBeTruthy();
  });

  it("forceFlag sticht das Flag (Tests/Vorschau)", () => {
    clearFlags();
    const view = render(<TokenUsageWidget forceFlag usage={PUBLIC_USAGE} />);
    expect(view.getByTestId("token-usage-widget")).toBeTruthy();
  });
});

describe("Sektion mit Mock-API", () => {
  it("lädt öffentliche Summen und zeigt Admin-Schalter", async () => {
    setMockVisibility(COMPANY_ID, { public: true, showCost: false });
    const view = render(
      <CompanyTokenUsageSection
        companyId={COMPANY_ID}
        forceFlag
        isAdmin
        mock
      />,
    );

    await waitFor(() => {
      expect(view.getByText("12,4")).toBeTruthy();
    });
    expect(view.getByTestId("token-usage-admin")).toBeTruthy();
    expect(bodyText()).not.toContain("41,87");

    fireEvent.click(view.getByRole("switch", { name: "Kosten zeigen" }));

    await waitFor(() => {
      expect(bodyText()).toContain("41,87");
    });
  });

  it("zeigt Opt-out als privat und sperrt die Kostenfreigabe", async () => {
    setMockVisibility(COMPANY_ID, { public: false });
    const view = render(
      <CompanyTokenUsageSection
        companyId={COMPANY_ID}
        forceFlag
        isAdmin
        mock
      />,
    );

    await waitFor(() => {
      expect(bodyText()).toContain(
        "Diese Firma zeigt ihren Token-Verbrauch nicht öffentlich.",
      );
    });
    const costSwitch = view.getByRole("switch", {
      name: "Kosten zeigen",
    }) as HTMLButtonElement;
    expect(costSwitch.disabled).toBe(true);
  });

  it("zeigt Besuchern keine Schalter", async () => {
    const view = render(
      <CompanyTokenUsageSection companyId={COMPANY_ID} forceFlag mock />,
    );

    await waitFor(() => {
      expect(view.getByText("12,4")).toBeTruthy();
    });
    expect(view.queryByTestId("token-usage-admin")).toBeNull();
  });
});
