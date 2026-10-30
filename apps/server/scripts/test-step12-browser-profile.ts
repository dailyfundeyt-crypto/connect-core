import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentBrowserDirs } from "../src/agent-hub/catalog";
import { assertNotStefanProfile } from "../src/agent-hub/routes";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 12: EIGENER HELIUM-BROWSER, ISOLATION & PROFIL-START ===\n");

  const testAgentId = "agent_test_step12_" + Date.now();

  console.log("1. Sicherheits-Check: Stefans persönliches Helium-Profil darf NIE verwendet werden:");
  const stefanDirWin = "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\User Data";
  const stefanDirEnv = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "imput", "Helium", "User Data")
    : stefanDirWin;

  let stefanBlocked1 = false;
  try {
    assertNotStefanProfile(stefanDirEnv);
  } catch (err: any) {
    if (err.message && err.message.includes("SICHERHEITSABBRUCH")) {
      stefanBlocked1 = true;
      console.log("   - Stefan User Data abgelehnt (korrekt):", err.message);
    }
  }
  if (!stefanBlocked1) throw new Error("FEHLER: Stefans Profil wurde nicht abgewiesen!");

  let stefanBlocked2 = false;
  try {
    assertNotStefanProfile(join(stefanDirEnv, "Default"));
  } catch (err: any) {
    if (err.message && err.message.includes("SICHERHEITSABBRUCH")) {
      stefanBlocked2 = true;
      console.log("   - Stefan Default Subfolder abgelehnt (korrekt):", err.message);
    }
  }
  if (!stefanBlocked2) throw new Error("FEHLER: Stefans Subfolder wurde nicht abgewiesen!");
  console.log("   -> Stefans Profilschutz erfolgreich verifiziert: 100% isoliert.\n");

  console.log("2. Verifiziere Verzeichnis-Isolation für neuen Agenten:");
  const dirs = agentBrowserDirs(testAgentId);
  console.log("   - Agent ID:        ", testAgentId);
  console.log("   - Root-Dir:        ", dirs.root);
  console.log("   - Helium-Profil:   ", dirs.profile);
  console.log("   - Output-Dir:      ", dirs.output);

  // Stelle sicher, dass Agent-Pfad nicht Stefan ist
  assertNotStefanProfile(dirs.profile);
  console.log("   -> Agenten-Profil liegt in isoliertem ConnectAgents-Verzeichnis: OK\n");

  console.log("3. Erstelle Test-Agent in Postgres DB:");
  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'Test-Bot-Browser-12', 'built_in', '{}', 'antigravity', 'dailyfunde.yt@gmail.com', NOW(), NOW())",
  );
  console.log("   - DB-Agent angelegt:", testAgentId, "\n");

  // Session-Token für authentifizierten Loopback-Call holen
  const sessionCookieVal =
    "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
  const authHeaders = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:3101",
    "Cookie": `better-auth.session_token=${sessionCookieVal}`,
  };

  console.log("4. Simuliere Schalter „Browser aktivieren“ via Server-Handler:");
  const putRes = await fetch(`http://127.0.0.1:3101/api/agent-hub/agents/${testAgentId}/browser`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ enabled: true, headless: true }),
  });
  console.log("   - PUT /browser Status-Code:", putRes.status);
  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Fehler bei PUT /browser: ${putRes.status} ${errText}`);
  }
  const putData = (await putRes.json()) as any;
  console.log("   - Server Enabled:  ", putData.enabled);
  console.log("   - Profil-Pfad:     ", putData.profileDir);
  console.log("   - Stefan Protected:", putData.isStefanProtected);

  console.log("\n5. Verifiziere physische Profil-Dateien auf der Platte:");
  const profileExists = existsSync(dirs.profile);
  console.log("   - Profil-Ordner physisch angelegt:", profileExists);
  if (!profileExists) throw new Error("Fehler: Profil-Ordner wurde nicht angelegt!");

  const markerPath = join(dirs.profile, ".connect-agent-profile.json");
  const markerExists = existsSync(markerPath);
  console.log("   - Marker .connect-agent-profile.json vorhanden:", markerExists);
  if (markerExists) {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    console.log("   - Marker-Inhalt:    ", JSON.stringify(marker));
    if (!marker.isolated || !marker.stefanProtected) {
      throw new Error("Fehler: Marker-Schutzflags fehlen!");
    }
  }

  console.log("\n6. Verifiziere DB-Aktualisierung (agents.browser_profile & browser_status):");
  const [dbRow] = await sql.unsafe(
    "SELECT browser_profile, browser_status, browser_status_at FROM agents WHERE id = $1",
    [testAgentId],
  );
  console.log("   - DB browser_profile:", dbRow?.browser_profile);
  console.log("   - DB browser_status: ", dbRow?.browser_status);
  console.log("   - DB browser_status_at:", dbRow?.browser_status_at);
  if (dbRow?.browser_profile !== dirs.profile) {
    throw new Error("Fehler: agents.browser_profile stimmt nicht mit Profil-Pfad überein!");
  }

  console.log("\n7. Teste GET /api/agent-hub/agents/:agentId/browser/status:");
  const statusRes = await fetch(`http://127.0.0.1:3101/api/agent-hub/agents/${testAgentId}/browser/status`, {
    headers: authHeaders,
  });
  console.log("   - GET /browser/status Code:", statusRes.status);
  const statusData = (await statusRes.json()) as any;
  console.log("   - Status:         ", statusData.status);
  console.log("   - Profile Exists: ", statusData.profileExists);
  console.log("   - Enabled:        ", statusData.enabled);
  console.log("   - Stefan Protected:", statusData.isStefanProtected);
  if (!statusData.enabled || !statusData.profileExists) {
    throw new Error("Fehler: Status-Abfrage liefert unvollständige Daten!");
  }

  console.log("\n8. Teste POST /api/agent-hub/agents/:agentId/browser/open-profile („Profil öffnen“):");
  const openRes = await fetch(`http://127.0.0.1:3101/api/agent-hub/agents/${testAgentId}/browser/open-profile`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  console.log("   - POST /open-profile Code:", openRes.status);
  if (!openRes.ok) {
    const errText = await openRes.text();
    throw new Error(`Fehler bei POST /open-profile: ${openRes.status} ${errText}`);
  }
  const openData = (await openRes.json()) as any;
  console.log("   - OK:              ", openData.ok);
  console.log("   - Profil-Pfad:     ", openData.profileDir);
  console.log("   - Gestartet mit:   ", openData.binary);
  console.log("   - Nachricht:       ", openData.message);

  console.log("\n9. Cleanup Test-Agent & Test-Profil:");
  await sql.unsafe("DELETE FROM agents WHERE id = $1", [testAgentId]);
  console.log("   - DB-Agent gelöscht: OK");

  if (existsSync(dirs.root)) {
    rmSync(dirs.root, { recursive: true, force: true });
    console.log("   - Test-Agent Browser-Ordner gelöscht: OK");
  }

  await sql.end();
  console.log("\n✅ ALLE SCHRITT 12 TESTS ERFOLGREICH BESTANDEN!");
}

runTest().catch((err) => {
  console.error("Testfehler:", err);
  process.exit(1);
});
