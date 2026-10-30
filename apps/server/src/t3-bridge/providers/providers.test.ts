/**
 * Tests der Provider-Registry (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Abgedeckte Abnahmekriterien:
 *  - Mapping-Tabelle vollständig (jedes `CLI_TARGETS`-Ziel der App gemappt)
 *  - Codex und Claude an Position 1 und 2
 *  - jeder Treiber aus `BUILT_IN_DRIVERS` des Forks enthalten (inkl. Hermes,
 *    Freebuff) — die Prüfliste ist `T3_FORK_BUILT_IN_DRIVER_ORDER`
 *  - unbekannte Treiber → `unavailable`
 *  - keine Pfade zu Credential-Dateien in der Ausgabe
 *  - Cache 30 s, kein Polling-Sturm (Single-Flight)
 *  - nur lesender RPC (`server.getConfig`), nie ein Refresh/Login
 *  - Flag aus = keine Lesung
 */

import { describe, expect, test } from "bun:test";
import {
  CLI_TARGET_TO_T3_PROVIDER,
  fromT3ApprovalDecisionWire,
  T3_APPROVAL_DECISION_TO_WIRE,
  T3_PROVIDER_IDS,
  t3ProviderForCliTarget,
  toT3ApprovalDecisionWire,
} from "../contracts";
import type { T3ServerConfig, T3ServerProvider } from "../rpc/types";
import {
  T3_CLI_TARGETS,
  T3_DRIVER_CATALOG,
  T3_DRIVER_DISPLAY_ORDER,
  T3_FORK_BUILT_IN_DRIVER_ORDER,
  T3_LEGACY_CLI_TARGETS,
  t3DriverCatalogEntry,
} from "./catalog";
import {
  getT3ProviderRegistry,
  listT3Providers,
  resetT3ProviderRegistryForTests,
} from "./index";
import { scrubProviderText } from "./redact";
import {
  buildCliTargetStates,
  buildProviderEntries,
  T3_PROVIDER_STATUS_CACHE_MS,
  T3ProviderRegistry,
  toProviderListResponse,
} from "./registry";
import {
  createFailingProviderConfigSource,
  createRpcProviderConfigSource,
  createStaticProviderConfigSource,
} from "./source";
import type { T3ProviderEntry } from "./types";

/* ---------------------------------------------------------------------------------------- *
 * Fixtures
 * ---------------------------------------------------------------------------------------- */

function provider(
  overrides: Partial<T3ServerProvider> & { driver: string },
): T3ServerProvider {
  return {
    instanceId: `${overrides.driver}:default`,
    enabled: true,
    installed: true,
    status: "ready",
    version: null,
    models: [],
    ...overrides,
  };
}

function config(
  providers: T3ServerProvider[],
  extra: Partial<T3ServerConfig> = {},
): T3ServerConfig {
  return {
    environment: {
      environmentId: "env-a04",
      label: "A04 Test",
      serverVersion: "0.0.0-test",
      orchestrationProtocolVersion: 2,
    },
    providers,
    ...extra,
  };
}

function entryFor(
  snapshot: { entries: readonly T3ProviderEntry[] },
  driver: string,
): T3ProviderEntry | undefined {
  return snapshot.entries.find(
    (entry) => entry.driver === driver && entry.provider !== null,
  );
}

/* ---------------------------------------------------------------------------------------- *
 * Katalog & Mapping
 * ---------------------------------------------------------------------------------------- */

describe("A04 Katalog", () => {
  test("Katalog deckt jeden Treiber des Vertrags genau einmal ab", () => {
    const catalogIds = T3_DRIVER_CATALOG.map((entry) => entry.provider).sort();
    expect(catalogIds).toEqual([...T3_PROVIDER_IDS].sort());
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
  });

  test("Prüfliste entspricht BUILT_IN_DRIVERS des Forks (11 Treiber)", () => {
    expect([...T3_FORK_BUILT_IN_DRIVER_ORDER]).toEqual([
      "codex",
      "claudeAgent",
      "cursor",
      "grok",
      "hermes",
      "freebuff",
      "opencode",
      "antigravity",
      "pi",
      "muse",
      "acpRegistry",
    ]);
  });

  test("Codex und Claude stehen an Position 1 und 2", () => {
    expect(T3_DRIVER_DISPLAY_ORDER[0]).toBe("codex");
    expect(T3_DRIVER_DISPLAY_ORDER[1]).toBe("claudeAgent");
    expect(T3_DRIVER_CATALOG[0]?.provider).toBe("codex");
    expect(T3_DRIVER_CATALOG[1]?.provider).toBe("claudeAgent");
  });

  test("jeder Fork-Treiber hat einen Katalogeintrag, Hermes und Freebuff sind Fork", () => {
    for (const driver of T3_FORK_BUILT_IN_DRIVER_ORDER) {
      expect(t3DriverCatalogEntry(driver)).toBeDefined();
    }
    expect(t3DriverCatalogEntry("hermes")?.fork).toBe(true);
    expect(t3DriverCatalogEntry("freebuff")?.fork).toBe(true);
    expect(t3DriverCatalogEntry("codex")?.fork).toBe(false);
    expect(t3DriverCatalogEntry("acpRegistry")?.multiInstance).toBe(true);
    expect(t3DriverCatalogEntry("unbekannt")).toBeUndefined();
  });
});

describe("A04 Mapping Connect-CLI-Ziel → T3-Treiber", () => {
  test("jedes CLI_TARGETS-Ziel der App ist gemappt", () => {
    for (const { target } of T3_CLI_TARGETS) {
      expect(CLI_TARGET_TO_T3_PROVIDER[target]).toBeDefined();
    }
    // 9 Ziele wie in apps/app/src/lib/agents/agent-cli.ts
    expect(T3_CLI_TARGETS).toHaveLength(9);
  });

  test("ChatGPT läuft über Codex, Claude über claudeAgent", () => {
    expect(t3ProviderForCliTarget("chatgpt")).toBe("codex");
    expect(t3ProviderForCliTarget("claude")).toBe("claudeAgent");
    expect(t3ProviderForCliTarget("codex")).toBe("codex");
    expect(t3ProviderForCliTarget("cursor")).toBe("cursor");
    expect(t3ProviderForCliTarget("grok")).toBe("grok");
    expect(t3ProviderForCliTarget("antigravity")).toBe("antigravity");
    expect(t3ProviderForCliTarget("freebuff")).toBe("freebuff");
  });

  test("Manus, Lovable und ZGPT bleiben legacy", () => {
    for (const target of T3_LEGACY_CLI_TARGETS) {
      expect(t3ProviderForCliTarget(target)).toBe("legacy");
    }
    expect(t3ProviderForCliTarget("manus")).toBe("legacy");
    expect(t3ProviderForCliTarget("lovable")).toBe("legacy");
    expect(t3ProviderForCliTarget("zgpt")).toBe("legacy");
    // Ein unbekanntes Ziel wird nie versehentlich ein T3-Treiber.
    expect(t3ProviderForCliTarget("gibt-es-nicht")).toBe("legacy");
  });

  test("jedes Nicht-legacy-Mapping zeigt auf einen echten Vertrags-Treiber", () => {
    for (const mapped of Object.values(CLI_TARGET_TO_T3_PROVIDER)) {
      if (mapped === "legacy") continue;
      expect(T3_PROVIDER_IDS).toContain(mapped);
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Aufbau der Liste
 * ---------------------------------------------------------------------------------------- */

describe("A04 Provider-Liste", () => {
  test("meldet alle 11 Treiber, auch wenn der Sidecar nur wenige kennt", () => {
    const snapshot = buildProviderEntries(
      config([provider({ driver: "codex" })]),
    );
    const known = snapshot.entries.filter((entry) => entry.provider !== null);
    expect(known).toHaveLength(T3_PROVIDER_IDS.length);
    for (const id of T3_PROVIDER_IDS) {
      expect(known.some((entry) => entry.provider === id)).toBe(true);
    }
    // Fehlende Treiber sind da, aber als nicht verfügbar.
    const cursor = known.find((entry) => entry.provider === "cursor");
    expect(cursor?.availability).toBe("unavailable");
    expect(cursor?.installed).toBe(false);
    expect(cursor?.reason).toBe("T3 meldet diesen Treiber nicht.");
  });

  test("Hermes und Freebuff stehen als eigene Zeilen in der Liste", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({ driver: "codex" }),
        provider({ driver: "claudeAgent", displayName: "Claude" }),
        provider({ driver: "hermes", displayName: "Hermes" }),
        provider({ driver: "freebuff", displayName: "Freebuff" }),
      ]),
    );

    const hermes = entryFor(snapshot, "hermes");
    const freebuff = entryFor(snapshot, "freebuff");
    expect(hermes?.provider).toBe("hermes");
    expect(hermes?.fork).toBe(true);
    expect(hermes?.label).toBe("Hermes");
    expect(freebuff?.provider).toBe("freebuff");
    expect(freebuff?.fork).toBe(true);
    expect(freebuff?.label).toBe("Freebuff");
  });

  test("Codex und Claude stehen an Position 1 und 2 der Liste", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({ driver: "hermes" }),
        provider({ driver: "codex" }),
        provider({ driver: "freebuff" }),
        provider({ driver: "claudeAgent" }),
      ]),
    );
    expect(snapshot.entries[0]?.provider).toBe("codex");
    expect(snapshot.entries[1]?.provider).toBe("claudeAgent");
  });

  test("ACP-Agenten bekommen je Instanz eine Zeile (AcpRegistryDriver)", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({
          driver: "acpRegistry",
          instanceId: "acpRegistry:devin",
          displayName: "Devin",
        }),
        provider({
          driver: "acpRegistry",
          instanceId: "acpRegistry:marvin",
          displayName: "Marvin",
        }),
      ]),
    );

    const acp = snapshot.entries.filter(
      (entry) => entry.provider === "acpRegistry",
    );
    expect(acp).toHaveLength(2);
    expect(acp.map((entry) => entry.label).sort()).toEqual(["Devin", "Marvin"]);
    expect(acp.every((entry) => entry.driver === "acpRegistry")).toBe(true);
    expect(acp.every((entry) => entry.transport === "acp")).toBe(true);
    expect(snapshot.unknownDrivers).toHaveLength(0);
  });

  test("unbekannter Treiber erscheint als unavailable statt zu verschwinden", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({ driver: "codex" }),
        provider({
          driver: "quantumAgent",
          displayName: "Quantum",
          installed: true,
          enabled: true,
          status: "ready",
        }),
      ]),
    );

    expect(snapshot.unknownDrivers).toEqual(["quantumAgent"]);
    const quantum = snapshot.entries.find(
      (entry) => entry.driver === "quantumAgent",
    );
    expect(quantum).toBeDefined();
    expect(quantum?.provider).toBeNull();
    expect(quantum?.availability).toBe("unavailable");
    expect(quantum?.transport).toBe("unknown");
    expect(quantum?.reason).toContain("Unbekannter T3-Treiber");
    // Kein Absturz, alle bekannten Treiber bleiben da.
    expect(
      snapshot.entries.filter((entry) => entry.provider !== null),
    ).toHaveLength(T3_PROVIDER_IDS.length);
  });

  test("deaktivierte oder fehlerhafte Treiber sind unavailable, mit Grund", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({ driver: "codex", enabled: false }),
        provider({
          driver: "claudeAgent",
          status: "error",
          message: "Login abgelaufen",
        }),
      ]),
    );

    const codex = entryFor(snapshot, "codex");
    const claude = entryFor(snapshot, "claudeAgent");
    expect(codex?.enabled).toBe(false);
    expect(codex?.availability).toBe("unavailable");
    expect(claude?.availability).toBe("unavailable");
    expect(claude?.reason).toBe("Login abgelaufen");
  });

  test("Status, Version, Modelle und Limits werden übernommen", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({
          driver: "codex",
          version: "1.2.3",
          auth: { status: "authenticated", email: "a@b.invalid" },
          models: [{ slug: "gpt-5-codex", name: "GPT-5 Codex" }],
          usageLimits: {
            checkedAt: "2026-10-29T10:00:00.000Z",
            windows: [
              {
                id: "session",
                kind: "session",
                label: "Session",
                usedPercent: 42,
                resetsAt: "2026-10-29T18:00:00.000Z",
              },
            ],
          },
        }),
      ]),
    );

    const codex = entryFor(snapshot, "codex");
    expect(codex?.installed).toBe(true);
    expect(codex?.authenticated).toBe(true);
    expect(codex?.auth).toBe("authenticated");
    expect(codex?.version).toBe("1.2.3");
    expect(codex?.models).toEqual(["gpt-5-codex"]);
    expect(codex?.limits).toHaveLength(1);
    expect(codex?.limits[0]).toEqual({
      provider: "codex",
      kind: "session",
      label: "Session",
      usedPercent: 42,
      resetsAt: "2026-10-29T18:00:00.000Z",
    });
  });

  test("CLI-Ziele: legacy bleibt legacy, echte Ziele spiegeln den Treiber", () => {
    const snapshot = buildProviderEntries(
      config([provider({ driver: "codex" })]),
    );
    const cliTargets = buildCliTargetStates(snapshot.entries);
    const byTarget = new Map(cliTargets.map((entry) => [entry.target, entry]));

    expect(byTarget.get("manus")?.legacy).toBe(true);
    expect(byTarget.get("manus")?.availability).toBe("legacy");
    expect(byTarget.get("lovable")?.legacy).toBe(true);
    expect(byTarget.get("codex")?.provider).toBe("codex");
    expect(byTarget.get("chatgpt")?.provider).toBe("codex");
    expect(byTarget.get("claude")?.provider).toBe("claudeAgent");
    expect(byTarget.get("claude")?.availability).toBe("unavailable");
    expect(byTarget.get("freebuff")?.availability).toBe("unavailable");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Keine Credential-Pfade
 * ---------------------------------------------------------------------------------------- */

describe("A04 Redaktion", () => {
  test("Windows-Credential-Pfad wird ersetzt", () => {
    expect(scrubProviderText("C:\\Users\\Kunc GmbH\\.codex\\auth.json")).toBe(
      "<Pfad>",
    );
    const inline = scrubProviderText(
      "Login fehlt: C:\\Users\\Kunc GmbH\\.codex\\auth.json",
    );
    expect(inline).toBe("Login fehlt: <Pfad>");
    expect(inline).not.toContain("auth.json");
    expect(inline).not.toContain(".codex");
  });

  test("POSIX- und Home-Pfade werden ersetzt", () => {
    expect(scrubProviderText("/home/stefan/.claude/credentials.json")).toBe(
      "<Pfad>",
    );
    expect(scrubProviderText("~/.config/opencode/tokens.json")).toBe("<Pfad>");
    expect(scrubProviderText("Siehe /etc/ssl/private/key.pem")).toBe(
      "Siehe <Pfad>",
    );
  });

  test("harmlose Sätze bleiben unverändert", () => {
    expect(scrubProviderText("nicht installiert")).toBe("nicht installiert");
    expect(scrubProviderText("Login abgelaufen, bitte neu anmelden")).toBe(
      "Login abgelaufen, bitte neu anmelden",
    );
    expect(scrubProviderText("")).toBeUndefined();
    expect(scrubProviderText(null)).toBeUndefined();
  });

  test("die Registry-Ausgabe enthält keinen Credential-Pfad", () => {
    const snapshot = buildProviderEntries(
      config([
        provider({
          driver: "codex",
          // Nicht installiert → der Grund wird übernommen (und dabei redigiert).
          installed: false,
          unavailableReason:
            "Token ungültig: C:\\Users\\Kunc GmbH\\.codex\\auth.json",
          runtimePaths: {
            homePath: "C:\\Users\\Kunc GmbH\\.codex",
            shadowHomePath: null,
          },
          workspaceSnapshots: [
            {
              cwd: "C:\\Users\\Kunc GmbH\\projekt",
              checkedAt: "2026-10-29T10:00:00.000Z",
              slashCommands: [],
              skills: [],
            },
          ],
        }),
        provider({
          driver: "claudeAgent",
          status: "error",
          message: "Credential fehlt: ~/.claude/credentials.json",
        }),
      ]),
    );

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("auth.json");
    expect(serialized).not.toContain("credentials.json");
    expect(serialized).not.toContain("C:\\\\Users");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".codex");
    expect(serialized).not.toContain(".claude");
    expect(serialized).toContain("<Pfad>");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Cache, Single-Flight, Flag
 * ---------------------------------------------------------------------------------------- */

describe("A04 Cache", () => {
  test("30 s Cache, danach eine neue Lesung", async () => {
    let now = 1_000_000;
    let calls = 0;
    const registry = new T3ProviderRegistry({
      source: {
        async getConfig() {
          calls += 1;
          return config([provider({ driver: "codex" })]);
        },
      },
      now: () => now,
    });

    const first = await registry.list();
    expect(first.fromCache).toBe(false);
    expect(calls).toBe(1);
    expect(first.cacheTtlMs).toBe(T3_PROVIDER_STATUS_CACHE_MS);
    expect(T3_PROVIDER_STATUS_CACHE_MS).toBe(30_000);

    now += 29_999;
    const cached = await registry.list();
    expect(cached.fromCache).toBe(true);
    expect(cached.cacheAgeMs).toBe(29_999);
    expect(calls).toBe(1);

    now += 1; // genau 30 s → Cache abgelaufen
    const fresh = await registry.list();
    expect(fresh.fromCache).toBe(false);
    expect(calls).toBe(2);

    await registry.list({ force: true });
    expect(calls).toBe(3);
  });

  test("parallele Aufrufe teilen sich eine Lesung (kein Polling-Sturm)", async () => {
    let calls = 0;
    const registry = new T3ProviderRegistry({
      source: {
        async getConfig() {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return config([provider({ driver: "codex" })]);
        },
      },
      now: () => 5_000_000,
    });

    const [a, b, c] = await Promise.all([
      registry.list(),
      registry.list(),
      registry.list(),
    ]);
    expect(calls).toBe(1);
    expect(a.fetchedAt).toBe(b.fetchedAt);
    expect(b.fetchedAt).toBe(c.fetchedAt);
  });

  test("Sidecar weg → vollständige Liste, alles unavailable, ohne Pfad", async () => {
    const registry = new T3ProviderRegistry({
      source: createFailingProviderConfigSource(
        "Verbindung fehlgeschlagen: C:\\Users\\Kunc GmbH\\.codex\\auth.json",
      ),
      now: () => 7_000_000,
    });

    const snapshot = await registry.list();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.entries).toHaveLength(T3_PROVIDER_IDS.length);
    expect(
      snapshot.entries.every((entry) => entry.availability === "unavailable"),
    ).toBe(true);
    expect(snapshot.message).toContain("<Pfad>");
    expect(JSON.stringify(snapshot)).not.toContain("auth.json");
    expect(
      snapshot.cliTargets.find((entry) => entry.target === "manus")?.legacy,
    ).toBe(true);
  });
});

describe("A04 Feature-Flag", () => {
  test("Flag aus: keine Lesung, leere Antwort", async () => {
    let calls = 0;
    const registry = new T3ProviderRegistry({
      enabled: false,
      source: {
        async getConfig() {
          calls += 1;
          return config([provider({ driver: "codex" })]);
        },
      },
    });

    const snapshot = await registry.list();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.cliTargets).toEqual([]);
    expect(calls).toBe(0);
  });

  test("getT3ProviderRegistry folgt connect.t3.bridge", async () => {
    const previous = process.env.CONNECT_FLAGS_T3;
    resetT3ProviderRegistryForTests();
    try {
      process.env.CONNECT_FLAGS_T3 = "no-bridge";
      expect(getT3ProviderRegistry()).toBeNull();
      const disabled = await listT3Providers();
      expect(disabled.enabled).toBe(false);

      process.env.CONNECT_FLAGS_T3 = "bridge";
      const registry = getT3ProviderRegistry({
        source: createStaticProviderConfigSource(
          config([provider({ driver: "codex" })]),
        ),
      });
      expect(registry).not.toBeNull();
      const snapshot = await listT3Providers({ registry });
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.entries[0]?.provider).toBe("codex");
    } finally {
      if (previous === undefined) delete process.env.CONNECT_FLAGS_T3;
      else process.env.CONNECT_FLAGS_T3 = previous;
      resetT3ProviderRegistryForTests();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * RPC: nur lesen
 * ---------------------------------------------------------------------------------------- */

describe("A04 RPC-Quelle", () => {
  test("ruft ausschließlich server.getConfig auf", async () => {
    const methods: string[] = [];
    const source = createRpcProviderConfigSource(async (method) => {
      methods.push(method);
      return config([provider({ driver: "codex" })]);
    });

    await source.getConfig();
    expect(methods).toEqual(["server.getConfig"]);
  });

  test("die Registry löst keinen Provider-Refresh aus", async () => {
    const methods: string[] = [];
    const registry = new T3ProviderRegistry({
      source: createRpcProviderConfigSource(async (method) => {
        methods.push(method);
        return config([
          provider({ driver: "codex" }),
          provider({ driver: "claudeAgent" }),
        ]);
      }),
      now: () => 9_000_000,
    });

    await registry.list({ force: true });
    await registry.list({ force: true });
    expect(methods).toEqual(["server.getConfig", "server.getConfig"]);
    expect(methods).not.toContain("server.refreshProviders");
  });

  test("ungültige Antwort wird als Fehler behandelt, nicht als Liste", async () => {
    const source = createRpcProviderConfigSource(async () => "kein objekt");
    await expect(source.getConfig()).rejects.toThrow("server.getConfig");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Vertragskompatible Sicht
 * ---------------------------------------------------------------------------------------- */

describe("A04 Vertrags-Sicht", () => {
  test("T3ProviderListResponse: 11 Treiber, Codex und Claude zuerst", async () => {
    const registry = new T3ProviderRegistry({
      source: createStaticProviderConfigSource(
        config(
          [
            provider({ driver: "codex", installed: true }),
            provider({ driver: "claudeAgent", installed: true }),
            provider({ driver: "quantumAgent" }),
          ],
          {},
        ),
      ),
      now: () => 11_000_000,
    });

    const response = toProviderListResponse(await registry.list());
    expect(response.providers).toHaveLength(T3_PROVIDER_IDS.length);
    expect(response.providers[0]?.provider).toBe("codex");
    expect(response.providers[1]?.provider).toBe("claudeAgent");
    expect(response.serverContractVersion).toBe(2);
    // Unbekannte Treiber brechen den Vertrag nicht.
    expect(
      response.providers.some(
        (entry) => (entry.provider as string) === "quantumAgent",
      ),
    ).toBe(false);
    // … werden aber benannt (Vertragserweiterung 29.10.2026).
    expect(response.unknownDrivers).toEqual(["quantumAgent"]);
    // Die neue Zeile trägt Herkunft, Anzeigename, Nutzbarkeit und Limits.
    expect(response.providers[0]).toMatchObject({
      provider: "codex",
      driver: "codex",
      displayName: "Codex",
      availability: "available",
      fork: false,
      limits: [],
    });
  });

  test("Vertrags-Sicht unterscheidet mehrere ACP-Agenten (Instanz + Name)", async () => {
    const registry = new T3ProviderRegistry({
      source: createStaticProviderConfigSource(
        config([
          provider({
            driver: "acpRegistry",
            instanceId: "acpRegistry:devin",
            displayName: "Devin",
          }),
          provider({
            driver: "acpRegistry",
            instanceId: "acpRegistry:marvin",
            displayName: "Marvin",
          }),
        ]),
      ),
      now: () => 12_000_000,
    });

    const response = toProviderListResponse(await registry.list());
    const acp = response.providers.filter(
      (entry) => entry.provider === "acpRegistry",
    );
    expect(acp).toHaveLength(2);
    expect(acp.map((entry) => entry.displayName).sort()).toEqual([
      "Devin",
      "Marvin",
    ]);
    expect(new Set(acp.map((entry) => entry.instanceId)).size).toBe(2);
    expect(acp.every((entry) => entry.driver === "acpRegistry")).toBe(true);
  });

  test("Freigabe-Entscheidungen: Connect-Werte ↔ T3-Wire-Werte", () => {
    expect(T3_APPROVAL_DECISION_TO_WIRE).toEqual({
      allow: "accept",
      deny: "decline",
      allow_always: "acceptAlways",
    });
    for (const wire of [
      "accept",
      "acceptForSession",
      "acceptAlways",
      "decline",
      "cancel",
    ] as const) {
      const connect = fromT3ApprovalDecisionWire(wire);
      // Rückweg ist verlustbehaftet, aber nie ungültig.
      expect(["allow", "deny", "allow_always"]).toContain(connect);
    }
    expect(toT3ApprovalDecisionWire("allow_always")).toBe("acceptAlways");
    expect(fromT3ApprovalDecisionWire("cancel")).toBe("deny");
  });
});
