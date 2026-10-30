import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SUBAGENTS,
  normalizeAgentSubagents,
  formatSubagentsContext,
  syncAgentSubagentsToWorkspace,
  type AgentSubagent,
} from "../src/agents/agent-subagents";
import {
  lookupAgentSubagents,
  getAgentWorkspaceDir,
} from "../src/agent-hub/agent-terminal-manager";
import { getAgentCliConfigDirs } from "../src/agent-hub/codex-accounts";
import { assertNotStefanProfile } from "../src/agent-hub/routes";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 14: SUBAGENTEN (ONLINE-KIS) MIT NAME, LINK, BESCHREIBUNG & STARTWERTEN ===\n");

  const testAgentId = "agent_test_step14_" + Date.now();

  console.log("1. Sicherheits-Check: Stefans persönliches Helium-Profil darf NIE berührt werden:");
  const stefanDirWin = "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\User Data";
  const stefanDirEnv = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "imput", "Helium", "User Data")
    : stefanDirWin;

  let stefanBlocked = false;
  try {
    assertNotStefanProfile(stefanDirEnv);
  } catch (err: any) {
    if (err.message && err.message.includes("SICHERHEITSABBRUCH")) {
      stefanBlocked = true;
      console.log("   - Stefan User Data abgelehnt (korrekt):", err.message);
    }
  }
  if (!stefanBlocked) throw new Error("FEHLER: Stefans Profil wurde nicht abgewiesen!");
  console.log("   -> Stefans Profilschutz erfolgreich verifiziert: 100% isoliert.\n");

  console.log("2. Startwerte-Verifikation (Manus, Perplexity Computer, Ottermind, Lovable):");
  console.log("   - Geforderte Startwerte prüfen:");
  for (const s of DEFAULT_SUBAGENTS) {
    console.log(`     * ${s.name}: ${s.url} - "${s.description}" [${s.enabled ? "AKTIV" : "INAKTIV"}]`);
  }
  if (DEFAULT_SUBAGENTS.length !== 4) throw new Error("Fehler: DEFAULT_SUBAGENTS hat nicht genau 4 Einträge!");

  const manus = DEFAULT_SUBAGENTS.find((s) => s.name === "Manus");
  if (!manus || !manus.url.includes("manus.im/app") || manus.description !== "komplexe Browsernutzung") {
    throw new Error("Fehler: Startwert Manus entspricht nicht den Vorgaben!");
  }

  const perplexity = DEFAULT_SUBAGENTS.find((s) => s.name === "Perplexity Computer");
  if (!perplexity || !perplexity.url.includes("perplexity.ai/computer") || perplexity.description !== "Recherche") {
    throw new Error("Fehler: Startwert Perplexity Computer entspricht nicht den Vorgaben!");
  }

  const ottermind = DEFAULT_SUBAGENTS.find((s) => s.name === "Ottermind");
  if (!ottermind || !ottermind.url.includes("ottermind.ai/studio/task") || ottermind.description !== "Datenauswertung") {
    throw new Error("Fehler: Startwert Ottermind entspricht nicht den Vorgaben!");
  }

  const lovable = DEFAULT_SUBAGENTS.find((s) => s.name === "Lovable");
  if (!lovable || !lovable.url.includes("lovable.dev/dashboard") || lovable.description !== "Landing Pages") {
    throw new Error("Fehler: Startwert Lovable entspricht nicht den Vorgaben!");
  }
  console.log("   -> Alle 4 Startwerte (Manus, Perplexity, Ottermind, Lovable) exakt korrekt: OK\n");

  console.log("3. Normalisierung prüfen (leere Eingabe liefert Startwerte, Custom-Subagenten ergänzen):");
  const emptyNorm = normalizeAgentSubagents([]);
  if (emptyNorm.length !== 4) throw new Error("Fehler: Leere Eingabe hat nicht 4 Startwerte geliefert!");
  console.log("   - Leeres Array normalisiert zu Startwerten: OK");

  const customTestInput = [
    {
      name: "Manus",
      link: "https://manus.im/app",
      beschreibung: "komplexe Browsernutzung",
      enabled: true,
    },
    {
      name: "Custom Research Agent",
      url: "https://custom-ai.org/portal",
      description: "Spezielle Branchenrecherche",
      enabled: false,
    },
  ];
  const customNorm = normalizeAgentSubagents(customTestInput);
  if (customNorm.length !== 2) throw new Error("Fehler: Custom Normalisierung hat nicht 2 Einträge!");
  if (customNorm[0].description !== "komplexe Browsernutzung") {
    throw new Error("Fehler: 'beschreibung' wurde nicht als 'description' normalisiert!");
  }
  console.log("   - Custom Normalisierung mit alias Feldern (link/beschreibung): OK\n");

  console.log("4. Markdown-Kontext-Generierung prüfen (formatSubagentsContext):");
  const markdownContext = formatSubagentsContext(DEFAULT_SUBAGENTS);
  console.log("   - Erzeugter Kontext-Auszug:\n");
  console.log(markdownContext.split("\n").map((l) => "     | " + l).join("\n"));
  if (!markdownContext.includes("| Name | Link / Portal | Spezialisierung / Beschreibung |")) {
    throw new Error("Fehler: Tabellen-Kopfzeile fehlt im Subagenten-Kontext!");
  }
  if (!markdownContext.includes("manus.im/app") || !markdownContext.includes("perplexity.ai/computer")) {
    throw new Error("Fehler: Startwerte fehlen in der Markdown-Tabelle!");
  }
  console.log("\n   -> Markdown-Tabelle für Kontext-Injektion erfolgreich verifiziert: OK\n");

  console.log("5. Physische Datei-Synchronisation in den Agent-Workspace (SUBAGENTS.md & subagents.json):");
  const workspaceDir = getAgentWorkspaceDir(testAgentId);
  const paths = getAgentCliConfigDirs(testAgentId, "dailyfunde.yt@gmail.com");
  console.log("   - Test-Workspace-Pfad: ", workspaceDir);
  console.log("   - Antigravity-Home:    ", paths.antigravityHome);

  const syncResult = syncAgentSubagentsToWorkspace(
    testAgentId,
    DEFAULT_SUBAGENTS,
    workspaceDir,
    paths.antigravityHome,
  );
  console.log("   - Aktive Subagenten synchronisiert:", syncResult.activeCount);
  console.log("   - SUBAGENTS.md Pfad:               ", syncResult.subagentsDocPath);

  const subagentsMdExists = existsSync(syncResult.subagentsDocPath);
  console.log("   - SUBAGENTS.md existiert physisch: ", subagentsMdExists);
  if (!subagentsMdExists) throw new Error("Fehler: SUBAGENTS.md wurde nicht im Workspace angelegt!");

  const subagentsMdContent = readFileSync(syncResult.subagentsDocPath, "utf8");
  if (!subagentsMdContent.includes("| Name | Link / Portal | Spezialisierung / Beschreibung |")) {
    throw new Error("Fehler: SUBAGENTS.md enthält keine Tabelle!");
  }
  if (!subagentsMdContent.includes("https://manus.im/app")) {
    throw new Error("Fehler: Manus fehlt in SUBAGENTS.md!");
  }

  const subagentsJsonPath = join(workspaceDir, "subagents.json");
  const subagentsJsonExists = existsSync(subagentsJsonPath);
  console.log("   - subagents.json existiert physisch:", subagentsJsonExists);
  if (!subagentsJsonExists) throw new Error("Fehler: subagents.json wurde nicht angelegt!");
  const jsonParsed = JSON.parse(readFileSync(subagentsJsonPath, "utf8"));
  console.log("   - subagents.json Einträge:         ", jsonParsed.subagents.length);
  console.log("   -> Physische Dateien im Workspace erfolgreich verifiziert: OK\n");

  console.log("6. Postgres DB Speicherung & Lookup testen:");
  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, subagents, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'Test-Bot-Subagents-14', 'built_in', '{}', 'antigravity', 'dailyfunde.yt@gmail.com', '" +
      JSON.stringify(DEFAULT_SUBAGENTS) +
      "', NOW(), NOW())",
  );
  await sql.unsafe(
    "INSERT INTO agent_profiles (agent_id, owner_user_id, title, role_description, avatar_seed, visibility, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD', 'Test Bot 14', 'Subagents Test', 'seed14', 'public', NOW(), NOW())",
  );
  console.log("   - Agent & Profil in Postgres angelegt:", testAgentId);

  const lookedUp = await lookupAgentSubagents(testAgentId);
  console.log("   - lookupAgentSubagents(): ", lookedUp.length, "Einträge geladen");
  if (lookedUp.length !== 4) throw new Error("Fehler: lookupAgentSubagents hat nicht 4 Einträge geliefert!");
  console.log("   -> DB-Speicherung & Lookup erfolgreich verifiziert: OK\n");

  console.log("7. HTTP Endpunkte testen (GET, POST /add, POST /edit, POST /toggle, DELETE, POST /reset-defaults):");
  const sessionCookieVal =
    "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
  const authHeaders = {
    "Content-Type": "application/json",
    Origin: "http://localhost:3101",
    Cookie: `better-auth.session_token=${sessionCookieVal}`,
  };

  // 7a: GET /api/agents/:id/subagents
  const getRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/subagents`, {
    headers: authHeaders,
  });
  console.log("   - GET /api/agents/:id/subagents Status:", getRes.status);
  if (!getRes.ok) throw new Error(`GET /subagents fehlgeschlagen: ${getRes.status}`);
  const getData = (await getRes.json()) as any;
  console.log("   - GET gelieferte Subagenten:", getData.subagents?.length);
  if (getData.subagents?.length !== 4) throw new Error("Fehler: GET hat nicht 4 Subagenten geliefert!");

  // 7b: POST /api/agents/:id/subagents/add
  const addRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/subagents/add`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Cursor Composer",
      url: "https://cursor.com",
      description: "Full-Stack Code-Generierung",
      enabled: true,
    }),
  });
  console.log("   - POST /subagents/add Status:         ", addRes.status);
  if (!addRes.ok) throw new Error(`POST /subagents/add fehlgeschlagen: ${addRes.status}`);
  const addData = (await addRes.json()) as any;
  console.log("   - Subagenten nach Add:                ", addData.subagents?.length);
  if (addData.subagents?.length !== 5) throw new Error("Fehler: Subagent wurde nicht hinzugefügt!");

  // 7c: POST /api/agents/:id/subagents/edit
  const editRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/subagents/edit`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Cursor Composer",
      description: "Erweiterte KI-Code-Generierung und Refactoring",
    }),
  });
  console.log("   - POST /subagents/edit Status:        ", editRes.status);
  if (!editRes.ok) throw new Error(`POST /subagents/edit fehlgeschlagen: ${editRes.status}`);
  const editData = (await editRes.json()) as any;
  const editedItem = editData.subagents?.find((s: any) => s.name === "Cursor Composer");
  if (!editedItem?.description.includes("Erweiterte")) {
    throw new Error("Fehler: Editierung wurde nicht gespeichert!");
  }
  console.log("   - Editierter Text verifiziert:        ", editedItem.description);

  // 7d: POST /api/agents/:id/subagents/toggle
  const toggleRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/subagents/toggle`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Cursor Composer",
      enabled: false,
    }),
  });
  console.log("   - POST /subagents/toggle Status:      ", toggleRes.status);
  if (!toggleRes.ok) throw new Error(`POST /subagents/toggle fehlgeschlagen: ${toggleRes.status}`);
  const toggleData = (await toggleRes.json()) as any;
  const toggledItem = toggleData.subagents?.find((s: any) => s.name === "Cursor Composer");
  if (toggledItem?.enabled !== false) throw new Error("Fehler: Toggle hat Status nicht auf false gesetzt!");
  console.log("   - Cursor Composer nach Toggle:        ", toggledItem?.enabled ? "AKTIV" : "INAKTIV (korrekt)");

  // 7e: DELETE /api/agents/:id/subagents/:subagentId
  const deleteRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${testAgentId}/subagents/${encodeURIComponent("Cursor Composer")}`,
    {
      method: "DELETE",
      headers: authHeaders,
    },
  );
  console.log("   - DELETE /subagents/:id Status:       ", deleteRes.status);
  if (!deleteRes.ok) throw new Error(`DELETE /subagents/:id fehlgeschlagen: ${deleteRes.status}`);
  const deleteData = (await deleteRes.json()) as any;
  console.log("   - Subagenten nach Delete:             ", deleteData.subagents?.length);
  if (deleteData.subagents?.length !== 4) throw new Error("Fehler: Delete hat den Subagenten nicht entfernt!");

  // 7f: POST /api/agents/:id/subagents/reset-defaults
  const resetRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/subagents/reset-defaults`, {
    method: "POST",
    headers: authHeaders,
  });
  console.log("   - POST /subagents/reset-defaults:     ", resetRes.status);
  if (!resetRes.ok) throw new Error(`reset-defaults fehlgeschlagen: ${resetRes.status}`);
  const resetData = (await resetRes.json()) as any;
  console.log("   - Subagenten nach Reset:              ", resetData.subagents?.length);
  console.log("   -> HTTP-Routen erfolgreich verifiziert: OK\n");

  console.log("8. Cleanup:");
  await sql.unsafe("DELETE FROM agent_profiles WHERE agent_id = $1", [testAgentId]);
  await sql.unsafe("DELETE FROM agents WHERE id = $1", [testAgentId]);
  console.log("   - Test-Agent aus DB gelöscht");
  try {
    rmSync(workspaceDir, { recursive: true, force: true });
    console.log("   - Test-Workspace bereinigt");
  } catch {}

  console.log("\n=======================================================");
  console.log("✅ SCHRITT 14 ERFOLGREICH VERIFIZIERT!");
  console.log("   - Subagenten (Online-KIs): Liste mit Name, Link, Beschreibung, editierbar");
  console.log("   - Startwerte: Manus, Perplexity Computer, Ottermind, Lovable");
  console.log("   - Formatierung als Markdown-Kontext-Tabelle");
  console.log("   - Physische Workspace-Sync in SUBAGENTS.md & subagents.json");
  console.log("   - Postgres DB Speicherung (subagents jsonb)");
  console.log("   - Vollständige HTTP-CRUD Endpunkte (GET, add, edit, toggle, delete, reset-defaults)");
  console.log("   - 100% Stefan-Profilschutz unberührt");
  console.log("=======================================================\n");
}

runTest()
  .catch((err) => {
    console.error("\n❌ TEST FEHLGESCHLAGEN:", err);
    process.exit(1);
  })
  .finally(() => {
    sql.end({ timeout: 1 });
  });
