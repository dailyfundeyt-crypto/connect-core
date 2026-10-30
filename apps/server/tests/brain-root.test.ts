/**
 * Agent 2 – Tests für „Einstellungen – Daten-Pfad des Spark-Brain-Vaults änderbar“
 * (brain-root.ts / brain-root-routes.ts, Helium, 2026-10-23).
 *
 * Alles passiert in Temp-Ordnern unter %TEMP% – NIEMALS am echten Vault: Der
 * Speicherort connect.env wird per LOCALAPPDATA-Override in die Temp-Struktur
 * umgeleitet, bevor der Test etwas speichert. Start: `bun test tests/brain-root.test.ts` in apps/server.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Hono } from "hono";
import {
  canonicalPath,
  cleanBrainPath,
  countMarkdownNotes,
  getBrainRoot,
  setBrainRoot,
  validateBrainRoot,
} from "../src/brain/brain-root";
import { createBrainRootRoutes } from "../src/brain/brain-root-routes";
import { listMcpAuditLogs } from "../src/connect-mcp/grants";
import type { Database } from "../src/db/client";

let root = "";
let oldBrain = "";
let vault = "";
const passUser = (async (_c: unknown, next: () => Promise<void>) => next()) as never;

/** Schreibt die Test-connect.env so, als hätte die App gespeichert. */
function writeEnv(brain: string, vaultPath?: string): void {
  const dataDir = path.join(process.env.LOCALAPPDATA ?? "", "ConnectApp", "data");
  writeFileSync(path.join(dataDir, "connect.env"), [`CONNECT_BRAIN_PATH=${brain}`, ...(vaultPath ? [`CONNECT_BRAIN_VAULT_PATH=${vaultPath}`] : []), ""].join("\r\n"), "utf8");
}

beforeAll(() => {
  // Ein eigener Ordner in %TEMP% – nie der echte Vault.
  root = path.join(os.tmpdir(), `brain-root-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(path.join(root, "alt", "Shared"), { recursive: true });
  mkdirSync(path.join(root, "vault", "AlteNotizen"), { recursive: true });
  oldBrain = path.join(root, "alt");
  vault = path.join(root, "vault");
  writeFileSync(path.join(oldBrain, "hot.md"), "# Hot");
  writeFileSync(path.join(oldBrain, "Shared", "stefan.md"), "# Stefan");
  writeFileSync(path.join(vault, "AlteNotizen", "idee.md"), "# Idee");
  writeFileSync(path.join(vault, "bild.png"), "png");

  // Umleitung des Einstellungs-Speichers: connect.env landet im Temp-Ordner, nie am echten Ort.
  process.env.LOCALAPPDATA = path.join(root, "LokalAppData");
  mkdirSync(path.join(process.env.LOCALAPPDATA, "ConnectApp", "data"), { recursive: true });
  process.env.CONNECT_BRAIN_PATH = oldBrain;
  process.env.CONNECT_BRAIN_VAULT_PATH = vault;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const app = (configured?: string) => createBrainRootRoutes(passUser, configured ?? oldBrain);
const LOCAL = { headers: { host: "localhost:3101" } };

function jsonPost(target: Hono, route: string, body: unknown) {
  return target.request(route, {
    method: "POST",
    headers: { ...LOCAL.headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function envFile(): Promise<string> {
  return readFileSync(path.join(process.env.LOCALAPPDATA ?? "", "ConnectApp", "data", "connect.env"), "utf8");
}

describe("brain-root: prüfen", () => {
  test("bereinigt Explorer-Pfad-Kopie mit Anführungszeichen", () => {
    expect(cleanBrainPath(`"${oldBrain}"`)).toBe(oldBrain);
    expect(cleanBrainPath(`${oldBrain}\\`)).toBe(oldBrain);
    expect(cleanBrainPath("   ")).toBeNull();
  });

  test("POST /validate lehnt gesperrte Ordner auf Deutsch ab", async () => {
    for (const bad of ["C:\\Windows\\Temp", "C:\\Program Files\\X", "C:\\ProgramData\\X", process.cwd()]) {
      const body = (await (await jsonPost(app(), "/root/validate", { path: bad })).json()) as { valid: boolean; problem: string };
      expect(body.valid).toBe(false);
      expect(body.problem).toContain("System-, Programm- oder App-Ordner");
    }
  });

  test("POST /validate: fehlender Ordner → Frage nach Anlegen, dann Anlegen mit Schreibrechten", async () => {
    const neu = path.join(root, "NeuAnlegen");
    const first = (await (await jsonPost(app(), "/root/validate", { path: neu })).json()) as { canCreate: boolean; valid: boolean; problem: string };
    expect(first.canCreate).toBe(true);
    expect(first.valid).toBe(false);
    expect(first.problem).toContain("Neu anlegen");

    const second = (await (await jsonPost(app(), "/root/validate", { path: neu, create: true })).json()) as { exists: boolean; writable: boolean; valid: boolean };
    expect(second.exists).toBe(true);
    expect(second.writable).toBe(true);
    expect(second.valid).toBe(true);
    expect(statSync(neu).isDirectory()).toBe(true);
  });

  test("POST /validate: Datei statt Ordner und leerer Pfad", async () => {
    const fileRes = await jsonPost(app(), "/root/validate", { path: path.join(vault, "bild.png") });
    const fileBody = (await fileRes.json()) as { valid: boolean; problem: string };
    expect(fileBody.valid).toBe(false);
    expect(fileBody.problem).toContain("Datei");
    expect((await jsonPost(app(), "/root/validate", {})).status).toBe(400);
  });

  test("GET /root zeigt Pfad, Schreibrecht, Vault und Notiz-Anzahl (Brain + Vault)", async () => {
    const body = (await (await app().request("/root", LOCAL)).json()) as {
      path: string;
      exists: boolean;
      writable: boolean;
      noteCount: number | null;
      vaultPath: string | null;
    };
    expect(body.path).toBe(oldBrain);
    expect(body.exists).toBe(true);
    expect(body.writable).toBe(true);
    expect(body.noteCount).toBe(3); // 2 Brain + 1 Vault-Notiz, wie in der Brain-Ansicht
    expect(getBrainRoot().vaultPath).toBe(vault);
  });
});

describe("brain-root: umstellen", () => {
  test("„move“ wird abgelehnt mit deutscher Erklärung", async () => {
    const res = await jsonPost(app(), "/root", { path: path.join(root, "X"), mode: "move" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toContain("Verschieben");
  });

  test("„use“: leerer Ordner wird genutzt, alter bleibt vollständig", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(root, `use-${Date.now()}`);
    mkdirSync(target, { recursive: true });
    const res = await jsonPost(app(), "/root", { path: target, mode: "use" });
    const body = (await res.json()) as { ok: boolean; path: string; mode: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("use");
    expect(body.path.toLowerCase()).toBe(target.toLowerCase());

    // Der Server liest den neuen Ort sofort: GET /root und getBrainRoot stimmen überein.
    const after = (await (await app().request("/root", LOCAL)).json()) as { path: string; noteCount: number };
    expect(after.path.toLowerCase()).toBe(target.toLowerCase());
    expect(after.noteCount).toBe(1); // Brain leer, aber die Vault-Notiz bleibt sichtbar
    expect(getBrainRoot().path?.toLowerCase()).toBe(target.toLowerCase());

    // Der alte Ordner blieb unangetastet.
    expect(existsSync(path.join(oldBrain, "hot.md"))).toBe(true);
    expect(existsSync(path.join(oldBrain, "Shared", "stefan.md"), )).toBe(true);
    // Die Umstellung landet in der Test-connect.env.
    expect((await envFile()).toLowerCase()).toContain(`connect_brain_path=${target.toLowerCase()}`);
  });

  test("„copy“: Inhalte wandern in den neuen Ordner, alter bleibt Sicherungskopie", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(root, `copy-${Date.now()}`);
    mkdirSync(target, { recursive: true });
    const res = await jsonPost(app(), "/root", { path: target, mode: "copy" });
    const body = (await res.json()) as { ok: boolean; copiedFiles: number; noteCount: number; path: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.copiedFiles).toBe(2);
    expect(body.noteCount).toBe(2);
    expect(readFileSync(path.join(target, "Shared", "stefan.md"), "utf8")).toBe("# Stefan");
    expect(countMarkdownNotes(target)).toBe(2);
    expect(existsSync(path.join(oldBrain, "hot.md"))).toBe(true);
  });

  test("„copy“ lehnt nicht-leere Zielordner ab (kein Überschreiben)", async () => {
    writeEnv(oldBrain);
    const target = path.join(root, `voll-${Date.now()}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "besetzt.md"), "x");
    const res = await jsonPost(app(), "/root", { path: target, mode: "copy" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toContain("nicht leer");
  });

  test("„copy“ ohne existierenden Ursprungs-Ordner → klare Meldung", async () => {
    writeEnv(path.join(root, "gibts-nicht"));
    const target = path.join(root, `copy2-${Date.now()}`);
    const res = await jsonPost(app(), "/root", { path: target, mode: "copy" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toContain("Nur umstellen");
    expect(existsSync(target)).toBe(false);
  });

  test("Vault-Pfad wird erhalten, solange der neue Ort zum Vault gehört", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(vault, "Brain-neu");
    mkdirSync(target, { recursive: true });
    const res = await jsonPost(app(), "/root", { path: target, mode: "use" });
    expect(res.status).toBe(200);
    expect((await envFile()).toLowerCase()).toContain(`connect_brain_vault_path=${vault.toLowerCase()}`);
  });
});

describe("brain-root: defekte Anfragen und Nebenstellen", () => {
  test("fremder Host und nicht-JSON-Body", async () => {
    expect((await app().request("/root", { headers: { host: "evil.example" } })).status).toBe(403);
    expect(
      (
        await app().request("/root", {
          method: "POST",
          headers: { ...LOCAL.headers, "content-type": "text/plain" },
          body: "x",
        })
      ).status,
    ).toBe(415);
  });

  test("„use“ auf denselben Pfad → Meldung statt Stillstand", async () => {
    writeEnv(oldBrain);
    const res = await jsonPost(app(), "/root", { path: oldBrain, mode: "use" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toContain("bereits der aktuelle Speicherort");
  });

  test("Fremde Zeilen (z. B. Schlüssel) bleiben beim Umstellen erhalten", async () => {
    const file = path.join(process.env.LOCALAPPDATA ?? "", "ConnectApp", "data", "connect.env");
    writeFileSync(file, "KEY_ENCRYPTION_KEY=geheim\r\nCONNECT_BRAIN_PATH=alt\r\n", "utf8");
    const target = path.join(root, `keep-${Date.now()}`);
    mkdirSync(target, { recursive: true });
    const res = await jsonPost(app(), "/root", { path: target, mode: "use" });
    expect(res.status).toBe(200);
    const env = await envFile();
    expect(env).toContain("KEY_ENCRYPTION_KEY=geheim");
    expect(env.toLowerCase()).toContain(`connect_brain_path=${target.toLowerCase()}`);
  });
});

describe("brain-root: erweiterte Sicherheits- & Pfadpruefungen (Symlinks, Audit, Fortschritt)", () => {
  test("Symlink/Junction auf Windows-Systemordner wird per realpath erkannt und abgewiesen", () => {
    const junctionPath = path.join(root, `win-link-${Date.now()}`);
    try {
      symlinkSync(process.env.SystemRoot ?? "C:\\Windows", junctionPath, "junction");
      const probe = validateBrainRoot(junctionPath);
      expect(probe.valid).toBe(false);
      expect(probe.allowed).toBe(false);
      expect(probe.problem).toContain("System-, Programm- oder App-Ordner");
    } finally {
      try {
        unlinkSync(junctionPath);
      } catch {}
    }
  });

  test("Fortschritts-Callback beim Kopieren liefert done, total und relative Dateinamen", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(root, `progress-${Date.now()}`);
    mkdirSync(target, { recursive: true });

    const progressUpdates: Array<{ done: number; total: number; current: string }> = [];
    const result = await setBrainRoot(target, "copy", {
      onProgress: (done, total, current) => {
        progressUpdates.push({ done, total, current });
      },
    });

    expect(result.mode).toBe("copy");
    expect(result.copiedFiles).toBe(2);
    expect(progressUpdates.length).toBe(2);
    expect(progressUpdates[0].done).toBe(1);
    expect(progressUpdates[0].total).toBe(2);
    expect(progressUpdates[1].done).toBe(2);
    expect(progressUpdates[1].total).toBe(2);
  });

  test("POST /root mit SSE-Streaming (Accept: text/event-stream) liefert Live-Fortschritt", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(root, `stream-${Date.now()}`);
    mkdirSync(target, { recursive: true });

    const res = await app().request("/root", {
      method: "POST",
      headers: {
        ...LOCAL.headers,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({ path: target, mode: "copy" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: progress");
    expect(text).toContain('"percent":');
    expect(text).toContain("event: done");
    expect(text).toContain('"ok":true');
  });

  test("Kopieren ueberschreibt NIE vorhandene Zieldateien", async () => {
    writeEnv(oldBrain, vault);
    const target = path.join(root, `no-overwrite-${Date.now()}`);
    mkdirSync(path.join(target, "Shared"), { recursive: true });
    writeFileSync(path.join(target, "Shared", "stefan.md"), "Alte Zieldatei darf nicht ueberschrieben werden");

    let threw = false;
    try {
      await setBrainRoot(target, "copy");
    } catch (err) {
      threw = true;
      expect((err as Error).message).toMatch(/nicht leer|Zieldatei existiert bereits/);
    }
    expect(threw).toBe(true);

    expect(readFileSync(path.join(target, "Shared", "stefan.md"), "utf8")).toBe(
      "Alte Zieldatei darf nicht ueberschrieben werden",
    );
    expect(readFileSync(path.join(oldBrain, "Shared", "stefan.md"), "utf8")).toBe("# Stefan");
  });

  test("Getrennte Einstellungen: Brain- und Vault-Pfad koennen unabhaengig gesetzt werden", async () => {
    writeEnv(oldBrain, vault);
    const newBrain = path.join(root, `sep-brain-${Date.now()}`);
    const newVault = path.join(root, `sep-vault-${Date.now()}`);
    mkdirSync(newBrain, { recursive: true });
    mkdirSync(newVault, { recursive: true });

    const res = await jsonPost(app(), "/root", {
      path: newBrain,
      vaultPath: newVault,
      mode: "use",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; path: string; vaultPath: string };
    expect(body.ok).toBe(true);
    expect(body.path.toLowerCase()).toBe(newBrain.toLowerCase());
    expect(body.vaultPath.toLowerCase()).toBe(newVault.toLowerCase());

    const env = await envFile();
    expect(env.toLowerCase()).toContain(`connect_brain_path=${newBrain.toLowerCase()}`);
    expect(env.toLowerCase()).toContain(`connect_brain_vault_path=${newVault.toLowerCase()}`);

    const getRes = (await (await app().request("/root", LOCAL)).json()) as { path: string; vaultPath: string };
    expect(getRes.path.toLowerCase()).toBe(newBrain.toLowerCase());
    expect(getRes.vaultPath.toLowerCase()).toBe(newVault.toLowerCase());
  });

  test("Fallback auf brain-root.json: wenn connect.env keinen Pfad hat, wird brain-root.json gelesen", async () => {
    const dataDir = path.join(process.env.LOCALAPPDATA ?? "", "ConnectApp", "data");
    const jsonFile = path.join(dataDir, "brain-root.json");
    const envPath = path.join(dataDir, "connect.env");

    writeFileSync(envPath, "KEY_ENCRYPTION_KEY=test\r\n", "utf8");
    delete process.env.CONNECT_BRAIN_PATH;
    delete process.env.CONNECT_BRAIN_VAULT_PATH;

    const fallbackTarget = path.join(root, `fallback-${Date.now()}`);
    mkdirSync(fallbackTarget, { recursive: true });
    writeFileSync(jsonFile, JSON.stringify({ path: fallbackTarget, vaultPath: vault }), "utf8");

    try {
      const loc = getBrainRoot(null);
      expect(loc.path?.toLowerCase()).toBe(fallbackTarget.toLowerCase());
      expect(loc.vaultPath?.toLowerCase()).toBe(vault.toLowerCase());

      const savedTarget = path.join(root, `saved-target-${Date.now()}`);
      mkdirSync(savedTarget, { recursive: true });
      await jsonPost(app(), "/root", { path: savedTarget, mode: "use" });

      const env = await envFile();
      expect(env.toLowerCase()).toContain(`connect_brain_path=${savedTarget.toLowerCase()}`);
      const afterJson = JSON.parse(readFileSync(jsonFile, "utf8")) as { path: string };
      expect(afterJson.path).toBe(fallbackTarget);
    } finally {
      try {
        unlinkSync(jsonFile);
      } catch {}
    }
  });

  test("Audit-Logging: Aufrufe von /validate und /root werden protokolliert", async () => {
    const executedQueries: string[] = [];
    const mockDb = {
      execute: async (query: unknown) => {
        executedQueries.push(String(query));
        return [];
      },
    } as unknown as Database;

    const auditedApp = createBrainRootRoutes(passUser, oldBrain, mockDb);
    const validateRes = await jsonPost(auditedApp, "/root/validate", { path: oldBrain });
    expect(validateRes.status).toBe(200);

    const switchTarget = path.join(root, `audit-test-${Date.now()}`);
    mkdirSync(switchTarget, { recursive: true });
    const switchRes = await jsonPost(auditedApp, "/root", { path: switchTarget, mode: "use" });
    expect(switchRes.status).toBe(200);

    const logs = await listMcpAuditLogs(undefined, 20);
    const validateLog = logs.find((l) => l.toolName === "brain.root.validate");
    const switchLog = logs.find((l) => l.toolName === "brain.root.switch");
    expect(validateLog).toBeDefined();
    expect(validateLog?.agentName).toBe("connect-settings");
    expect(switchLog).toBeDefined();
    expect(switchLog?.status).toBe("success");
  });
});
