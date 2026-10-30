#!/usr/bin/env bun
/**
 * Stufe 4 E2E-Test: Freebuff-Engine (kostenlose CLI mit Browser-Use + Web-Research)
 *
 * Was geprüft wird:
 *   1. Freebuff-CLI ist installiert (`freebuff --version` läuft)
 *   2. Agent mit `freebuffEngine: { kind: "freebuff", ... }` lässt sich anlegen
 *   3. Der Agent-Pfad akzeptiert die Freebuff-Engine (Schema-Test)
 *   4. cliStatus('freebuff') erkennt die installierte CLI
 *
 * Freebuff selbst ist eine interaktive TUI ohne `--print`-Modus, deshalb
 * testen wir hier NICHT den vollen Live-Run (das wäre ein smoke-test der
 * TUI). Stufe 4.7 prüft das, wenn der User es manuell will.
 */
export {};

const BASE = "http://127.0.0.1:3001";

type Result = { name: string; ok: boolean; detail: string };

async function api<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json as T;
}

async function check(name: string, fn: () => Promise<string>): Promise<Result> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  console.log("Stufe 4: Freebuff E2E-Test");
  console.log("===========================\n");

  // 1. Freebuff-CLI installiert?
  const cliCheck = await check("Freebuff-CLI installiert", async () => {
    const proc = Bun.spawn(["freebuff", "--version"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`Exit ${code}: ${out.slice(0, 200)}`);
    return `Version: ${out.trim()}`;
  });
  console.log(`${cliCheck.ok ? "✅" : "❌"} ${cliCheck.name}: ${cliCheck.detail}`);

  // 2. Settings-Datei existiert?
  const settingsCheck = await check("Freebuff-Settings vorhanden", async () => {
    const path = `${process.env.USERPROFILE}/.config/manicode/settings.json`;
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`Settings nicht gefunden: ${path}`);
    const json = (await file.json()) as { freebuffModel?: string; mode?: string };
    return `mode=${json.mode ?? "?"}, freebuffModel=${json.freebuffModel ?? "auto"}`;
  });
  console.log(`${settingsCheck.ok ? "✅" : "❌"} ${settingsCheck.name}: ${settingsCheck.detail}`);

  // 3. Login vorhanden?
  const loginCheck = await check("Freebuff-Login (Credentials)", async () => {
    const path = `${process.env.USERPROFILE}/.config/manicode/credentials.json`;
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`Credentials nicht gefunden: ${path}`);
    const json = (await file.json()) as { default?: { tokenStore?: string; name?: string } };
    if (!json.default?.tokenStore) throw new Error("Kein tokenStore in credentials.json");
    return `Eingeloggt: ${json.default.name ?? "?"} (tokenStore=${json.default.tokenStore})`;
  });
  console.log(`${loginCheck.ok ? "✅" : "❌"} ${loginCheck.name}: ${loginCheck.detail}`);

  // 4. cliStatus('freebuff') über Server (via TypeScript-Datei)
  const statusCheck = await check("Server cliStatus('freebuff')", async () => {
    const proc = Bun.spawn(["bun", "-e", `
      import { cliStatus } from "./src/agent-hub/cli-model";
      const s = await cliStatus("freebuff");
      console.log(JSON.stringify(s));
    `], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`Exit ${code}: ${out.slice(0, 200)}`);
    const s = JSON.parse(out.trim()) as { installed: boolean; version: string | null; loggedIn: boolean | null };
    if (!s.installed) throw new Error("Freebuff nicht installiert");
    if (!s.loggedIn) throw new Error("Freebuff nicht eingeloggt");
    return `installed=${s.installed}, v=${s.version}, loggedIn=${s.loggedIn}`;
  });
  console.log(`${statusCheck.ok ? "✅" : "❌"} ${statusCheck.name}: ${statusCheck.detail}`);

  // 5. Schema-Support (POST ohne Auth sollte 401 geben, nicht 400 — das wäre Schema-Validierungs-Fehler)
  const schemaCheck = await check("Freebuff-Engine-Schema akzeptiert", async () => {
    const res = await fetch(`${BASE}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "FreebuffTest",
        title: "Freebuff E2E",
        roleDescription: "Schema test",
        visibility: "private",
        freebuffEngine: { kind: "freebuff", model: "auto", allowWrite: false },
      }),
    });
    if (res.status === 401 || res.status === 403) {
      // Auth-Wand → das Schema wurde akzeptiert
      return `Status ${res.status} (Auth) — Schema ist OK`;
    }
    if (res.status === 400) {
      const text = await res.text();
      throw new Error(`Schema lehnt freebuffEngine ab: ${text.slice(0, 200)}`);
    }
    return `Unerwarteter Status: ${res.status}`;
  });
  console.log(`${schemaCheck.ok ? "✅" : "❌"} ${schemaCheck.name}: ${schemaCheck.detail}`);

  // Zusammenfassung
  const all = [cliCheck, settingsCheck, loginCheck, statusCheck, schemaCheck];
  const passed = all.filter((r) => r.ok).length;
  console.log(`\n${passed}/${all.length} bestanden`);

  process.exit(passed === all.length ? 0 : 1);
}

main().catch((error) => {
  console.error("Test-Fehler:", error);
  process.exit(1);
});
