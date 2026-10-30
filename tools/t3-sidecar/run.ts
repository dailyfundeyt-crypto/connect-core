/**
 * T3-Sidecar CLI — Werkzeug zum Steuern des T3-Sidecars aus der Konsole.
 *
 * Lane: A02 (Welle W1).
 * Aufruf: bun tools/t3-sidecar/run.ts [start|stop|status|health] [--detach]
 */

import {
  getT3Supervisor,
  startT3Sidecar,
  stopT3Sidecar,
  getT3SidecarStatus,
  checkSidecarHealth,
  readServerRuntime,
  getT3RuntimeFilePath,
} from "../../apps/server/src/t3-bridge/sidecar/index";

const command = process.argv[2] || "status";
const isDetached = process.argv.includes("--detach") || process.argv.includes("-d");

async function main() {
  switch (command) {
    case "start": {
      console.log("[CLI] Starte T3-Sidecar...");
      const status = await startT3Sidecar({ force: true });
      console.log(`[CLI] Sidecar Status: ${status.state} (PID: ${status.pid}, Port: ${status.port})`);

      if (isDetached) {
        console.log("[CLI] Im Hintergrund gestartet (--detach).");
        process.exit(0);
      }

      console.log(`[CLI] Sidecar aktiv auf ${status.origin}. Drücke Strg+C zum Beenden...`);

      const handleExit = async () => {
        console.log("\n[CLI] Signal empfangen, beende T3-Sidecar...");
        await stopT3Sidecar();
        console.log("[CLI] Beendet.");
        process.exit(0);
      };

      process.on("SIGINT", handleExit);
      process.on("SIGTERM", handleExit);

      // Prozess am Leben halten
      await new Promise(() => {});
      break;
    }

    case "stop": {
      console.log("[CLI] Stoppe T3-Sidecar...");
      await stopT3Sidecar();
      console.log("[CLI] T3-Sidecar gestoppt.");
      process.exit(0);
      break;
    }

    case "status": {
      const status = getT3SidecarStatus();
      console.log("=== T3-Sidecar Status ===");
      console.log(`Zustand:       ${status.state}`);
      console.log(`Läuft:         ${status.running}`);
      console.log(`PID:           ${status.pid ?? "–"}`);
      console.log(`Port:          ${status.port ?? "–"}`);
      console.log(`Origin:        ${status.origin ?? "–"}`);
      console.log(`Home:          ${status.homeDir}`);
      console.log(`Runtime-Datei: ${status.runtimeFile}`);
      console.log(`Log-Datei:     ${status.logFile}`);
      console.log(`Healthy:       ${status.healthy}`);
      process.exit(0);
      break;
    }

    case "health": {
      const runtimePath = getT3RuntimeFilePath();
      const runtime = await readServerRuntime(runtimePath);
      if (!runtime || !runtime.origin) {
        console.log("[CLI] Kein laufender Sidecar gefunden.");
        process.exit(1);
      }
      console.log(`[CLI] Prüfe Erreichbarkeit von ${runtime.origin}...`);
      const res = await checkSidecarHealth(runtime.origin);
      if (res.healthy) {
        console.log(`[CLI] Sidecar erreichbar (HTTP ${res.status}, Dauer: ${res.durationMs}ms).`);
      } else {
        console.log(`[CLI] Sidecar nicht erreichbar: ${res.error}`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    default:
      console.log(`Unbekannter Befehl: ${command}`);
      console.log("Verfügbare Befehle: start [--detach], stop, status, health");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[CLI Fehler]", err);
  process.exit(1);
});
