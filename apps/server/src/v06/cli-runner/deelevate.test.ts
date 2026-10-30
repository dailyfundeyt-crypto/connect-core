import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  BrokerDeElevator,
  getDeElevator,
  spawnCli,
} from "./deelevate";
import { startCliBroker, type BrokerInstance } from "./broker/cli-broker";
import { getBrokerInfoPath } from "./broker/protocol";
import { rmSync } from "node:fs";

describe("CLI-Runner De-Elevation", () => {
  let broker: BrokerInstance | null = null;
  const originalEnvFlags = process.env.CONNECT_FLAGS_V06;

  afterEach(async () => {
    if (broker) {
      await broker.stop();
      broker = null;
    }
    try {
      rmSync(getBrokerInfoPath(), { force: true });
    } catch {}
    if (originalEnvFlags !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnvFlags;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  it("detects when broker is offline", async () => {
    const deElevator = new BrokerDeElevator();
    // Stelle sicher, dass keine alte broker.json stört
    rmSync(getBrokerInfoPath(), { force: true });
    const isAvail = await deElevator.isAvailable();
    expect(isAvail).toBe(false);
  });

  it("throws clear error with script recommendation when broker is offline", async () => {
    const deElevator = new BrokerDeElevator();
    rmSync(getBrokerInfoPath(), { force: true });

    await expect(
      deElevator.spawn({
        cmd: "echo",
        args: ["test"],
        cwd: process.cwd(),
      }),
    ).rejects.toThrow("CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1");
  });

  it("successfully spawns a process through the broker when active", async () => {
    // Starte Test-Broker
    broker = await startCliBroker({
      port: 5219,
      token: "test-token-unit",
      quiet: true,
    });

    const deElevator = new BrokerDeElevator();
    const isAvail = await deElevator.isAvailable();
    expect(isAvail).toBe(true);

    let output = "";
    let exitCode: number | null = null;

    const proc = await deElevator.spawn({
      cmd: process.platform === "win32" ? "cmd.exe" : "echo",
      args: process.platform === "win32" ? ["/c", "echo", "HelloFromBroker"] : ["HelloFromBroker"],
      cwd: process.cwd(),
      usePty: false,
      onData: (d) => {
        output += d;
      },
      onExit: (code) => {
        exitCode = code;
      },
    });

    expect(proc).toBeDefined();
    expect(proc.mode).toBe("pipe");

    // Warte kurz auf Abschluss
    for (let i = 0; i < 20; i++) {
      if (exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(output).toContain("HelloFromBroker");
    expect(exitCode as any).toBe(0);
  });

  it("spawnCli chooses DeElevator when cliDeElevated flag is active and provider is codex", async () => {
    // Flag aktivieren
    process.env.CONNECT_FLAGS_V06 = "cliDeElevated";

    // Broker ist offline -> muss Fehler mit Hinweis werfen
    rmSync(getBrokerInfoPath(), { force: true });

    await expect(
      spawnCli("codex", {
        workdir: process.cwd(),
      }),
    ).rejects.toThrow("CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1");
  });

  it("spawnCli does not require broker when cliDeElevated flag is disabled", async () => {
    // Flag deaktivieren
    process.env.CONNECT_FLAGS_V06 = "-cliDeElevated";

    rmSync(getBrokerInfoPath(), { force: true });

    // Sollte nicht die De-Elevator-Prüfung ausführen, sondern direkt spawnen
    let exitCode: number | null = null;
    const proc = await spawnCli(process.platform === "win32" ? "cmd.exe" : "echo", {
      workdir: process.cwd(),
      onExit: (c) => {
        exitCode = c;
      },
    });

    expect(proc).toBeDefined();
    proc.kill();
  });
});
