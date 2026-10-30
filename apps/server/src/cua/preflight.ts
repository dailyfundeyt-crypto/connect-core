/**
 * Windows-Vorprüfung für Cua-Laufzeitumgebung.
 *
 * Lane: A19
 * Prüft Virtualisierung (WSL2 / Hyper-V), Cua-Binary und Ausführbarkeit.
 * REGEL 3: OpenBot-v2-Docker nie anfassen oder stoppen!
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { CuaDoctorResult } from "./types";

/**
 * Standard-Pfade für die Cua-Binary unter Windows.
 */
export function resolveCuaBinaryPath(): string | null {
  // 1. Benutzerdefinierte Umgebungsvariable
  if (process.env.CUA_BIN && existsSync(process.env.CUA_BIN)) {
    return process.env.CUA_BIN;
  }

  // 2. Standardmäßiger Windows-Installationspfad (%LOCALAPPDATA%\Programs\cua\bin\cua.exe)
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local") : "");
  if (localAppData) {
    const candidate = join(localAppData, "Programs", "cua", "bin", "cua.exe");
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Im PATH suchen (Fallback "cua" oder "cua.exe")
  return "cua";
}

/**
 * Führt einen Befehl aus und fängt Timeout und Fehler sauber ab.
 */
export async function runProcess(
  cmd: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    try {
      const proc = spawn(cmd, args, {
        shell: process.platform === "win32",
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            proc.kill();
          } catch {
            // ignore
          }
          resolve({ exitCode: 124, stdout, stderr: `${stderr}\nTimeout nach ${timeoutMs}ms` });
        }
      }, timeoutMs);

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ exitCode: 1, stdout, stderr: err.message });
        }
      });

      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ exitCode: code ?? 0, stdout, stderr });
        }
      });
    } catch (err: unknown) {
      resolve({ exitCode: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Führt den Windows-Preflight für Cua durch.
 */
export async function checkWindowsPreflight(customCuaPath?: string): Promise<CuaDoctorResult> {
  const details: string[] = [];
  let cuaAvailable = false;
  let cuaVersion: string | undefined;
  let wsl2Available = false;
  let hyperVAvailable = false;
  let virtualizationEnabled = false;

  const isWindows = process.platform === "win32";
  if (!isWindows) {
    details.push(`Plattform ist ${process.platform} (nicht Windows). Cua läuft im Host-Modus.`);
  }

  // 1. Cua-Binary prüfen
  const binPath = customCuaPath ?? resolveCuaBinaryPath() ?? "cua";
  const versionRes = await runProcess(binPath, ["--version"]);
  if (versionRes.exitCode === 0) {
    cuaAvailable = true;
    cuaVersion = versionRes.stdout.trim().split("\n")[0]?.trim();
    details.push(`Cua-CLI gefunden: ${cuaVersion} (${binPath})`);
  } else {
    details.push(`Cua-CLI nicht erreichbar unter "${binPath}". Statuscode: ${versionRes.exitCode}`);
  }

  // 2. Windows-Virtualisierung prüfen (WSL2 / Hyper-V)
  if (isWindows) {
    // WSL-Prüfung
    const wslRes = await runProcess("wsl", ["--status"]);
    if (wslRes.exitCode === 0) {
      wsl2Available = true;
      virtualizationEnabled = true;
      details.push("WSL2 ist auf dem System installiert und aktiv.");
    } else {
      details.push("WSL2 ist nicht aktiv oder meldet Fehler.");
    }

    // Hyper-V / Virtualisierungsprüfung via systeminfo
    const sysRes = await runProcess("powershell", [
      "-NoProfile",
      "-Command",
      "(Get-CimInstance Win32_ComputerSystem).HypervisorPresent",
    ]);
    if (sysRes.exitCode === 0 && sysRes.stdout.toLowerCase().includes("true")) {
      hyperVAvailable = true;
      virtualizationEnabled = true;
      details.push("Hypervisor/Virtualisierung ist in der Windows-Firmware aktiviert.");
    } else {
      details.push("Hypervisor-Status nicht eindeutig ermittelbar oder deaktiviert.");
    }
  } else {
    // Auf Linux / macOS:
    virtualizationEnabled = true;
    wsl2Available = true;
    hyperVAvailable = true;
  }

  // 3. Cua Runtime Doctor aufrufen falls CLI da ist
  if (cuaAvailable) {
    const doctorRes = await runProcess(binPath, ["runtime", "doctor"]);
    if (doctorRes.stdout) {
      details.push(`Cua Doctor:\n${doctorRes.stdout.trim()}`);
    }
  }

  // Zusammenfassende Meldung auf Deutsch
  let message = "";
  if (!cuaAvailable) {
    message = "Cua CLI ist nicht installiert oder nicht im PATH. Bitte führen Sie tools/cua/check-windows-prerequisites.ps1 aus.";
  } else if (!virtualizationEnabled && isWindows) {
    message = "Virtualisierung (WSL2 / Hyper-V) ist nicht aktiviert. Sandboxes benötigen WSL2 oder Hyper-V.";
  } else {
    message = `Cua-Maschinen-Umgebung bereit (${cuaVersion ?? "installiert"}).`;
  }

  return {
    available: cuaAvailable,
    version: cuaVersion,
    wsl2Available,
    hyperVAvailable,
    virtualizationEnabled,
    details,
    message,
  };
}
