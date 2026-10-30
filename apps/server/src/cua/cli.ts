/**
 * Cua CLI Integration.
 *
 * Lane: A19
 * KERNREGEL & AKZEPTANZKRITERIUM:
 * Kein `rm`/`delete`-Aufruf an `cua` im gesamten Modul! Maschinen werden nie gelöscht.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CuaDoctorResult, CuaSandboxInfo, ICuaCli, MachineKind } from "./types";
import { checkWindowsPreflight, resolveCuaBinaryPath, runProcess } from "./preflight";

/** 1x1 transparenter PNG-Pixel als Fallback bei Screenshot-Erzeugung */
export const EMPTY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Produktions-Implementierung gegen die echte cua-CLI.
 */
export class CuaCliRunner implements ICuaCli {
  private binaryPath: string;

  constructor(customBinaryPath?: string) {
    this.binaryPath = customBinaryPath ?? resolveCuaBinaryPath() ?? "cua";
  }

  /**
   * Strikte Schutzprüfung: Verhindert jeglichen rm / delete Aufruf an cua.
   */
  private assertNotDestructive(args: string[]): void {
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === "rm" || lower === "delete" || lower === "--delete" || lower === "destroy") {
        throw new Error(
          `Cua-Destruktion verboten! Aufruf mit "${arg}" widerspricht den verbindlichen Regeln von Lane A19.`,
        );
      }
    }
  }

  private async exec(args: string[], timeoutMs = 30000): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    this.assertNotDestructive(args);
    return runProcess(this.binaryPath, args, timeoutMs);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.exec(["--version"], 4000);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  async doctor(): Promise<CuaDoctorResult> {
    return checkWindowsPreflight(this.binaryPath);
  }

  async createSandbox(name: string, kind: MachineKind = "sandbox"): Promise<{ name: string; ref: string }> {
    // Eigene Namen immer mit Präfix connect-cua-*
    const safeName = name.startsWith("connect-cua-") ? name : `connect-cua-${name}`;

    const args = ["sb", "create", "linux", "--name", safeName];
    if (kind === "local") {
      args.push("--kind", "container");
    }

    const res = await this.exec(args, 60000);
    if (res.exitCode !== 0 && !res.stdout.includes(safeName) && !res.stderr.includes("already exists")) {
      throw new Error(`Fehler beim Erstellen der Cua-Sandbox "${safeName}": ${res.stderr || res.stdout}`);
    }

    return {
      name: safeName,
      ref: `local:${safeName}`,
    };
  }

  async suspendSandbox(name: string): Promise<void> {
    const res = await this.exec(["sb", "suspend", name]);
    if (res.exitCode !== 0 && !res.stderr.includes("already")) {
      throw new Error(`Konnte Cua-Sandbox "${name}" nicht schlafen legen: ${res.stderr || res.stdout}`);
    }
  }

  async resumeSandbox(name: string): Promise<void> {
    const res = await this.exec(["sb", "resume", name]);
    if (res.exitCode !== 0 && !res.stderr.includes("already")) {
      throw new Error(`Konnte Cua-Sandbox "${name}" nicht aufwecken: ${res.stderr || res.stdout}`);
    }
  }

  async takeScreenshot(name: string): Promise<Uint8Array | null> {
    const tmpFile = join(tmpdir(), `cua-screen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    try {
      const res = await this.exec(["sb", "screenshot", name, tmpFile], 10000);
      if (res.exitCode === 0) {
        const data = await fs.readFile(tmpFile);
        return new Uint8Array(data);
      }
      return null;
    } catch {
      return null;
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async listSandboxes(): Promise<CuaSandboxInfo[]> {
    const res = await this.exec(["sb", "ls", "--json"]);
    if (res.exitCode !== 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(res.stdout);
      if (Array.isArray(parsed)) {
        return parsed.map((item: { id?: string; name?: string; status?: string; location?: string }) => ({
          id: item.id ?? item.name ?? "unknown",
          name: item.name ?? item.id ?? "unknown",
          status: item.status ?? "running",
          location: item.location,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async getSandboxInfo(name: string): Promise<CuaSandboxInfo | null> {
    const res = await this.exec(["sb", "info", name, "--json"]);
    if (res.exitCode !== 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(res.stdout);
      return {
        id: parsed.id ?? name,
        name: parsed.name ?? name,
        status: parsed.status ?? "running",
        location: parsed.location,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Fake-Cua-CLI für isolierte Tests ohne echte Cua- oder VM-Interaktion.
 * Zeichnet alle Aufrufe auf, um Nicht-Destruktivität und Parametrisierung zu verifizieren.
 */
export class FakeCuaCliRunner implements ICuaCli {
  public recordedCalls: Array<{ cmd: string; args: string[] }> = [];
  public sandboxes: Map<string, { status: "running" | "sleeping" | "stopped"; kind: MachineKind }> = new Map();
  public screenshotCallCount = 0;
  public available = true;

  private record(cmd: string, args: string[]): void {
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === "rm" || lower === "delete" || lower === "--delete" || lower === "destroy") {
        throw new Error(`VERBOTEN: FakeCuaCliRunner hat destruktiven Aufruf "${arg}" erhalten!`);
      }
    }
    this.recordedCalls.push({ cmd, args });
  }

  async isAvailable(): Promise<boolean> {
    this.record("cua", ["--version"]);
    return this.available;
  }

  async doctor(): Promise<CuaDoctorResult> {
    this.record("cua", ["runtime", "doctor"]);
    return {
      available: this.available,
      version: "cua 0.9.0 (fake)",
      wsl2Available: true,
      hyperVAvailable: true,
      virtualizationEnabled: true,
      details: ["Fake Cua Environment OK"],
      message: "Cua Fake-Umgebung bereit.",
    };
  }

  async createSandbox(name: string, kind: MachineKind = "sandbox"): Promise<{ name: string; ref: string }> {
    const safeName = name.startsWith("connect-cua-") ? name : `connect-cua-${name}`;
    this.record("cua", ["sb", "create", "linux", "--name", safeName]);
    this.sandboxes.set(safeName, { status: "sleeping", kind });
    return { name: safeName, ref: `local:${safeName}` };
  }

  async suspendSandbox(name: string): Promise<void> {
    this.record("cua", ["sb", "suspend", name]);
    const existing = this.sandboxes.get(name);
    if (existing) {
      existing.status = "sleeping";
    }
  }

  async resumeSandbox(name: string): Promise<void> {
    this.record("cua", ["sb", "resume", name]);
    const existing = this.sandboxes.get(name);
    if (existing) {
      existing.status = "running";
    }
  }

  async takeScreenshot(name: string): Promise<Uint8Array | null> {
    this.record("cua", ["sb", "screenshot", name]);
    this.screenshotCallCount++;
    return EMPTY_PNG;
  }

  async listSandboxes(): Promise<CuaSandboxInfo[]> {
    this.record("cua", ["sb", "ls", "--json"]);
    return Array.from(this.sandboxes.entries()).map(([name, data]) => ({
      id: name,
      name,
      status: data.status,
      location: "local",
    }));
  }

  async getSandboxInfo(name: string): Promise<CuaSandboxInfo | null> {
    this.record("cua", ["sb", "info", name, "--json"]);
    const found = this.sandboxes.get(name);
    if (!found) return null;
    return {
      id: name,
      name,
      status: found.status,
      location: "local",
    };
  }
}
