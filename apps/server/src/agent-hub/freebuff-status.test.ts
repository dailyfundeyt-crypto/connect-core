import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLaunchSlot, resetLaunchGuard } from "./browser-launch-guard";
import { startFreebuffSlot } from "./freebuff-launch";
import { runFreebuff } from "./freebuff-run";
import {
  FREEBUFF_SLOTS,
  buildFreebuffSlotEnv,
  ensureFreebuffSlotDirs,
  freebuffAccountsRoot,
  freebuffConfigDir,
  listFreebuffSlotOptions,
  resolveFreebuffSlot,
} from "./freebuff-slots";
import {
  defaultFreebuffConfigDir,
  freebuffSlotStatus,
  readFreebuffStatus,
  resolveFreebuffExecutable,
} from "./freebuff-status";

const tempDirs: string[] = [];

function tempDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `fb-${name}-`));
  tempDirs.push(dir);
  return dir;
}

/** Legt eine credentials.json mit Token an, ohne je einen echten Token zu benutzen. */
function writeFakeCredentials(dir: string, token = "TEST-TOKEN-DO-NOT-PRINT", name = "Test Konto"): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "credentials.json"),
    JSON.stringify({
      default: {
        id: "test-id",
        name,
        email: "test@example.invalid",
        fingerprintId: "test-fingerprint-id",
        fingerprintHash: "test-fingerprint-hash",
        tokenStore: token,
      },
    }),
    "utf8",
  );
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  rmSync(join(tmpdir(), "fb-isolation-a"), { recursive: true, force: true });
  rmSync(join(tmpdir(), "fb-isolation-b"), { recursive: true, force: true });
});

describe("freebuff-Status (echte Zustände statt Stub)", () => {
  it("meldet „nicht installiert“, wenn kein Binary gefunden wird", async () => {
    const status = await readFreebuffStatus({ executable: null, configDir: tempDir("ni") });
    expect(status.state).toBe("not-installed");
    expect(status.installed).toBe(false);
    expect(status.loggedIn).toBeNull();
    expect(status.detail).toContain("Nicht installiert");
  });

  it("meldet „nicht angemeldet“ für einen leeren Config-Ordner", async () => {
    const dir = tempDir("empty");
    const status = await readFreebuffStatus({
      executable: resolveFreebuffExecutable()?.path ?? null,
      configDir: dir,
      skipVersionProbe: true,
    });
    // Auf einer Maschine ohne freebuff ist „nicht installiert“ korrekt.
    if (!status.installed) {
      expect(status.state).toBe("not-installed");
      return;
    }
    expect(status.state).toBe("not-logged-in");
    expect(status.loggedIn).toBe(false);
  });

  it("meldet „bereit“ bei vorhandenem tokenStore und gibt keine Secrets aus", async () => {
    const dir = tempDir("ready");
    writeFakeCredentials(dir, "SUPER-SECRET-TOKEN-XYZ");
    const status = await readFreebuffStatus({ executable: "freebuff-fake", configDir: dir, skipVersionProbe: true });
    // "freebuff-fake" existiert nicht → nicht installiert; deshalb Binary-Auflösung neutralisieren:
    const resolved = resolveFreebuffExecutable();
    if (!resolved) return;
    const real = await readFreebuffStatus({ executable: resolved.path, configDir: dir, skipVersionProbe: true });
    expect(real.state).toBe("ready");
    expect(real.loggedIn).toBe(true);
    expect(real.accountName).toBe("Test Konto");
    expect(real.accountEmail).toBe("test@example.invalid");
    const serialized = JSON.stringify(real);
    expect(serialized).not.toContain("SUPER-SECRET-TOKEN-XYZ");
    expect(serialized).not.toContain("test-fingerprint-hash");
    expect(status.installed).toBe(false);
  });

  it("meldet „Fehler“, wenn credentials.json unlesbar ist", async () => {
    const dir = tempDir("broken");
    writeFileSync(join(dir, "credentials.json"), "{ kaputt", "utf8");
    const resolved = resolveFreebuffExecutable();
    const status = await readFreebuffStatus({
      executable: resolved ? resolved.path : null,
      configDir: dir,
      skipVersionProbe: true,
    });
    if (!status.installed) return;
    expect(status.state).toBe("error");
    expect(status.error).toBeTruthy();
  });

  it("prüft standardmäßig FREEBUFF_CONFIG_DIR als Config-Ordner", () => {
    const previous = process.env.FREEBUFF_CONFIG_DIR;
    const dir = tempDir("envcfg");
    process.env.FREEBUFF_CONFIG_DIR = dir;
    try {
      expect(defaultFreebuffConfigDir()).toBe(dir);
    } finally {
      if (previous === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
      else process.env.FREEBUFF_CONFIG_DIR = previous;
    }
  });
});

describe("Login-Trennung über FREEBUFF_CONFIG_DIR", () => {
  it("zwei leere Ordner sind getrennt und beide „nicht angemeldet“", async () => {
    const a = tempDir("a");
    const b = tempDir("b");
    const exe = resolveFreebuffExecutable();
    if (exe) {
      const statusA = await readFreebuffStatus({ executable: exe.path, configDir: a, skipVersionProbe: true });
      const statusB = await readFreebuffStatus({ executable: exe.path, configDir: b, skipVersionProbe: true });
      expect(statusA.configDir).not.toBe(statusB.configDir);
      expect(statusA.state).toBe("not-logged-in");
      expect(statusB.state).toBe("not-logged-in");
    } else {
      const statusA = await readFreebuffStatus({ executable: null, configDir: a });
      const statusB = await readFreebuffStatus({ executable: null, configDir: b });
      expect(statusA.configDir).not.toBe(statusB.configDir);
    }
  });

  it("ein Login in Ordner A bleibt aus Ordner B unsichtbar", async () => {
    const exe = resolveFreebuffExecutable();
    if (!exe) return;
    const a = tempDir("iso-a");
    const b = tempDir("iso-b");
    writeFakeCredentials(a);
    const statusA = await readFreebuffStatus({ executable: exe.path, configDir: a, skipVersionProbe: true });
    const statusB = await readFreebuffStatus({ executable: exe.path, configDir: b, skipVersionProbe: true });
    expect(statusA.state).toBe("ready");
    expect(statusB.state).toBe("not-logged-in");
  });

  it("die echte CLI schreibt mit FREEBUFF_CONFIG_DIR in den Slot-Ordner", async () => {
    const exe = resolveFreebuffExecutable();
    if (!exe || exe.kind === "cmd") return; // cmd-Wrapper wird hier nicht geprüft
    const a = tempDir("real-a");
    const b = tempDir("real-b");
    const probe = Bun.spawnSync([exe.command, ...exe.argsPrefix, "--version"], {
      env: { ...process.env, FREEBUFF_CONFIG_DIR: a },
      stdout: "ignore",
      stderr: "ignore",
    });
    if (probe.exitCode !== 0) return; // Umgebung erlaubt keinen Start → überspringen
    expect(readdirSync(a).length).toBeGreaterThan(0);
    expect(readdirSync(b).length).toBe(0);
  });

  it("vier Slots haben getrennte, absolute Ordner unter accounts/freebuff", () => {
    expect(FREEBUFF_SLOTS.length).toBe(4);
    const ids = FREEBUFF_SLOTS.map((slot) => slot.id);
    expect(ids).toEqual([
      "freebuff-skunc3021",
      "freebuff-kuncoleg096",
      "freebuff-meinezukunft",
      "freebuff-explorerada888",
    ]);
    const configDirs = new Set<string>();
    for (const slot of FREEBUFF_SLOTS) {
      const dirs = ensureFreebuffSlotDirs(slot.id);
      expect(dirs.configDir.startsWith(freebuffAccountsRoot())).toBe(true);
      expect(/^[A-Za-z]:[\\/]/.test(dirs.configDir)).toBe(true);
      configDirs.add(dirs.configDir.toLowerCase());
    }
    expect(configDirs.size).toBe(4);
    expect(listFreebuffSlotOptions().length).toBe(4);
  });

  it("resolveFreebuffSlot findet Slot über ID und E-Mail", () => {
    expect(resolveFreebuffSlot("freebuff-skunc3021")?.email).toBe("skunc3021@gmail.com");
    expect(resolveFreebuffSlot("skunc3021@gmail.com")?.id).toBe("freebuff-skunc3021");
    expect(resolveFreebuffSlot("gibt-es-nicht")).toBeNull();
  });

  it("buildFreebuffSlotEnv setzt FREEBUFF_CONFIG_DIR auf den Slot-Ordner", () => {
    const env = buildFreebuffSlotEnv("freebuff-kuncoleg096", {}, {});
    expect(env.FREEBUFF_CONFIG_DIR).toBe(freebuffConfigDir("freebuff-kuncoleg096"));
    expect(env.HOME).not.toBe(process.env.HOME);
    expect(env.CONNECT_FREEBUFF_SLOT).toBe("freebuff-kuncoleg096");
  });
});

describe("browser-launch-guard für freebuff", () => {
  it("blockiert den zweiten Start innerhalb von 15 s", () => {
    const key = "freebuff:test-guard";
    resetLaunchGuard(key);
    expect(acquireLaunchSlot(key, "Test").ok).toBe(true);
    const second = acquireLaunchSlot(key, "Test");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("warten");
    resetLaunchGuard(key);
    expect(acquireLaunchSlot(key, "Test").ok).toBe(true);
    resetLaunchGuard(key);
  });

  it("startet keinen unbekannten Slot und kein nicht installiertes freebuff", async () => {
    const unknown = await startFreebuffSlot("freebuff-gibt-es-nicht");
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toContain("Unbekannter");

    const missing = await startFreebuffSlot("freebuff-skunc3021", { executable: null });
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain("nicht installiert");
  });

  it("startFreebuffSlot lässt den zweiten Start desselben Slots nicht durch", async () => {
    const script = join(tempDir("fake-cli"), "freebuff-fake.js");
    writeFileSync(script, "process.exit(0);", "utf8");
    const key = "freebuff:freebuff-meinezukunft";
    resetLaunchGuard(key);
    const first = await startFreebuffSlot("freebuff-meinezukunft", { login: true, executable: script });
    expect(first.ok).toBe(true);
    const second = await startFreebuffSlot("freebuff-meinezukunft", { login: true, executable: script });
    // Entweder läuft der Slot noch (alreadyRunning) oder der Schutzschalter
    // blockt den zweiten Start — beides verhindert ein zweites Fenster.
    expect(second.alreadyRunning === true || second.ok === false).toBe(true);
    expect(second.message).toMatch(/warten|bereits/);
    resetLaunchGuard(key);
  });

  it("runFreebuff lehnt unbekannte Slots und leere Tasks ab, ohne zu starten", async () => {
    const unknown = await runFreebuff("freebuff-gibt-es-nicht", "Sag hallo");
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("Unbekannter");

    const empty = await runFreebuff("freebuff-skunc3021", "   ");
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain("Leerer Task");
  });

  it("runFreebuff startet ohne Login nichts", async () => {
    const exe = resolveFreebuffExecutable();
    if (!exe) return;
    // Nur testen, solange der Slot wirklich abgemeldet ist — sonst würde der Test
    // die echte CLI starten. Nach Stefans Login überspringt sich dieser Fall selbst.
    const status = await freebuffSlotStatus("freebuff-explorerada888", { executable: exe.path, skipVersionProbe: true });
    if (status.state !== "not-logged-in") return;
    const dir = tempDir("nologin");
    const result = await runFreebuff("freebuff-explorerada888", "Sag hallo", dir, {
      executable: exe.path,
      readyMs: 50,
      idleMs: 200,
      timeoutMs: 2_000,
    });
    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
    expect(result.error).toContain("Nicht angemeldet");
  });
});

describe("Anbieterliste in Connect", () => {
  it("liefert freebuff und die vier Slots mit echtem Status statt null", async () => {
    const { extraCliProviderStatus } = await import("./cli-extras");
    const list = await extraCliProviderStatus();

    const global = list.find((provider) => provider.kind === "freebuff");
    expect(global).toBeTruthy();
    // Der alte Stub lieferte hier IMMER null.
    expect(global?.loggedIn).not.toBeNull();
    expect(global?.detail).not.toContain("Einmal: freebuff login");

    const slots = list.filter((provider) => provider.kind.startsWith("freebuff:"));
    expect(slots.map((slot) => slot.kind)).toEqual([
      "freebuff:freebuff-skunc3021",
      "freebuff:freebuff-kuncoleg096",
      "freebuff:freebuff-meinezukunft",
      "freebuff:freebuff-explorerada888",
    ]);
    for (const slot of slots) {
      expect(typeof slot.loggedIn).toBe("boolean");
      expect(slot.installed).toBe(true);
    }
  }, 30_000);
});
