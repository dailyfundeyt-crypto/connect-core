import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeAgentWebsites,
  formatWebsitesContext,
  syncAgentWebsitesToWorkspace,
  type AgentWebsite,
} from "../src/agents/agent-websites";
import {
  lookupAgentWebsites,
  getAgentWorkspaceDir,
} from "../src/agent-hub/agent-terminal-manager";
import { getAgentCliConfigDirs } from "../src/agent-hub/codex-accounts";
import { assertNotStefanProfile } from "../src/agent-hub/routes";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 13: WEBSEITEN-LISTE (TABELLE URL + WOFÜR) & KONTEXT-INJEKTION ===\n");

  const testAgentId = "agent_test_step13_" + Date.now();

  console.log("1. Sicherheits-Check: Stefans persönliches Helium-Profil darf NIE verwendet werden:");
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

  console.log("2. Normalisierung der Webseiten-Liste prüfen (Strings, Objekte, wofür/purpose):");
  const rawTestInput = [
    "https://example.com",
    {
      url: "https://connect-kunc-preview.vercel.app",
      purpose: "Vorschau-Deployment testen und UI prüfen",
      enabled: true,
    },
    {
      url: "https://workspace.google.com",
      wofuer: "Google Workspace Konto dailyfunde.yt@gmail.com",
      enabled: true,
    },
    {
      url: "https://github.com/my-org/repo",
      description: "Quellcode-Repository & Commits",
      enabled: false,
    },
  ];

  const normalized = normalizeAgentWebsites(rawTestInput);
  console.log("   - Normalisierte Einträge:", normalized.length);
  for (const site of normalized) {
    console.log(`     * [${site.enabled ? "AKTIV" : "INAKTIV"}] ${site.url} -> Zweck: "${site.purpose}" (ID: ${site.id})`);
  }
  if (normalized.length !== 4) throw new Error("Fehler: Normalisierung hat nicht 4 Einträge erzeugt!");
  if (normalized[2].purpose !== "Google Workspace Konto dailyfunde.yt@gmail.com") {
    throw new Error("Fehler: 'wofuer' wurde nicht korrekt als 'purpose' normalisiert!");
  }
  console.log("   -> Normalisierung erfolgreich: OK\n");

  console.log("3. Markdown-Kontext-Generierung prüfen (formatWebsitesContext):");
  const markdownContext = formatWebsitesContext(normalized);
  console.log("   - Erzeugter Kontext-Auszug:\n");
  console.log(markdownContext.split("\n").map((l) => "     | " + l).join("\n"));
  if (!markdownContext.includes("| URL | Wofür / Zweck |")) {
    throw new Error("Fehler: Tabellen-Kopfzeile | URL | Wofür / Zweck | fehlt im Kontext!");
  }
  if (!markdownContext.includes("https://connect-kunc-preview.vercel.app")) {
    throw new Error("Fehler: Vercel-Preview-URL fehlt im Kontext!");
  }
  console.log("\n   -> Markdown-Tabelle für Kontext-Injektion erfolgreich verifiziert: OK\n");

  console.log("4. Physische Datei-Synchronisation in den Agent-Workspace (WEBSITES.md & websites.json):");
  const workspaceDir = getAgentWorkspaceDir(testAgentId);
  const paths = getAgentCliConfigDirs(testAgentId, "dailyfunde.yt@gmail.com");
  console.log("   - Test-Workspace-Pfad: ", workspaceDir);
  console.log("   - Antigravity-Home:    ", paths.antigravityHome);

  const syncResult = syncAgentWebsitesToWorkspace(
    testAgentId,
    normalized,
    workspaceDir,
    paths.antigravityHome,
  );
  console.log("   - Aktive Webseiten synchronisiert:", syncResult.activeCount);
  console.log("   - WEBSITES.md Pfad:               ", syncResult.websitesDocPath);

  const websitesMdExists = existsSync(syncResult.websitesDocPath);
  console.log("   - WEBSITES.md existiert physisch: ", websitesMdExists);
  if (!websitesMdExists) throw new Error("Fehler: WEBSITES.md wurde nicht im Workspace angelegt!");

  const websitesMdContent = readFileSync(syncResult.websitesDocPath, "utf8");
  if (!websitesMdContent.includes("| URL | Wofür / Zweck |")) {
    throw new Error("Fehler: WEBSITES.md enthält keine Tabelle mit URL und Wofür!");
  }
  if (!websitesMdContent.includes("https://connect-kunc-preview.vercel.app")) {
    throw new Error("Fehler: Vercel Preview fehlt in WEBSITES.md!");
  }

  const websitesJsonPath = join(workspaceDir, "websites.json");
  const websitesJsonExists = existsSync(websitesJsonPath);
  console.log("   - websites.json existiert physisch:", websitesJsonExists);
  if (!websitesJsonExists) throw new Error("Fehler: websites.json wurde nicht angelegt!");
  const jsonParsed = JSON.parse(readFileSync(websitesJsonPath, "utf8"));
  console.log("   - websites.json Einträge:         ", jsonParsed.websites.length);
  console.log("   -> Physische Dateien im Workspace erfolgreich verifiziert: OK\n");

  console.log("5. Postgres DB Speicherung & Lookup testen:");
  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, website_list, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'Test-Bot-Websites-13', 'built_in', '{}', 'antigravity', 'dailyfunde.yt@gmail.com', '" +
      JSON.stringify(normalized) +
      "', NOW(), NOW())",
  );
  await sql.unsafe(
    "INSERT INTO agent_profiles (agent_id, owner_user_id, title, role_description, avatar_seed, visibility, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD', 'Test Bot', 'Test Role Description', 'seed13', 'public', NOW(), NOW())",
  );
  console.log("   - Agent & Profil in Postgres angelegt:", testAgentId);

  const [dbRow] = await sql.unsafe(
    "SELECT website_list FROM agents WHERE id = $1 LIMIT 1",
    [testAgentId],
  );
  console.log("   - DB website_list Typ:    ", typeof dbRow.website_list, Array.isArray(dbRow.website_list));
  console.log("   - DB website_list Anzahl: ", (dbRow.website_list as any[]).length);

  const lookedUp = await lookupAgentWebsites(testAgentId);
  console.log("   - lookupAgentWebsites():  ", lookedUp.length, "Einträge geladen");
  if (lookedUp.length !== 4) throw new Error("Fehler: lookupAgentWebsites hat nicht alle Einträge geliefert!");
  console.log("   -> DB-Speicherung & Lookup erfolgreich verifiziert: OK\n");

  console.log("6. HTTP Endpunkte testen (GET, POST /add, POST /toggle, DELETE):");
  const sessionCookieVal =
    "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
  const authHeaders = {
    "Content-Type": "application/json",
    Origin: "http://localhost:3101",
    Cookie: `better-auth.session_token=${sessionCookieVal}`,
  };

  // 6a: GET /api/agents/:id/websites
  const getRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/websites`, {
    headers: authHeaders,
  });
  console.log("   - GET /api/agents/:id/websites Status:", getRes.status);
  if (!getRes.ok) throw new Error(`GET /websites fehlgeschlagen: ${getRes.status}`);
  const getData = (await getRes.json()) as any;
  console.log("   - GET gelieferte Webseiten:", getData.websites?.length);

  // 6b: POST /api/agents/:id/websites/add
  const addRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/websites/add`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      url: "https://news.ycombinator.com",
      purpose: "Tech News und Trends beobachten",
      enabled: true,
    }),
  });
  console.log("   - POST /websites/add Status:          ", addRes.status);
  if (!addRes.ok) throw new Error(`POST /websites/add fehlgeschlagen: ${addRes.status}`);
  const addData = (await addRes.json()) as any;
  console.log("   - Webseiten nach Add:                 ", addData.websites?.length);

  // 6c: POST /api/agents/:id/websites/toggle
  const toggleRes = await fetch(`http://127.0.0.1:3101/api/agents/${testAgentId}/websites/toggle`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      url: "https://news.ycombinator.com",
      enabled: false,
    }),
  });
  console.log("   - POST /websites/toggle Status:       ", toggleRes.status);
  if (!toggleRes.ok) throw new Error(`POST /websites/toggle fehlgeschlagen: ${toggleRes.status}`);
  const toggleData = (await toggleRes.json()) as any;
  const toggledItem = toggleData.websites?.find((w: any) => w.url === "https://news.ycombinator.com");
  console.log("   - news.ycombinator.com nach Toggle:   ", toggledItem?.enabled ? "AKTIV" : "INAKTIV (korrekt)");
  if (toggledItem?.enabled !== false) throw new Error("Fehler: Toggle hat Status nicht auf false gesetzt!");

  // 6d: DELETE /api/agents/:id/websites/:websiteId
  const deleteRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${testAgentId}/websites/${encodeURIComponent("https://news.ycombinator.com")}`,
    {
      method: "DELETE",
      headers: authHeaders,
    },
  );
  console.log("   - DELETE /websites/:id Status:        ", deleteRes.status);
  if (!deleteRes.ok) throw new Error(`DELETE /websites/:id fehlgeschlagen: ${deleteRes.status}`);
  const deleteData = (await deleteRes.json()) as any;
  console.log("   - Webseiten nach Delete:              ", deleteData.websites?.length);
  console.log("   -> HTTP-Routen erfolgreich verifiziert: OK\n");

  console.log("7. Cleanup:");
  await sql.unsafe("DELETE FROM agent_profiles WHERE agent_id = $1", [testAgentId]);
  await sql.unsafe("DELETE FROM agents WHERE id = $1", [testAgentId]);
  console.log("   - Test-Agent aus DB gelöscht");
  try {
    rmSync(workspaceDir, { recursive: true, force: true });
    console.log("   - Test-Workspace bereinigt");
  } catch {}

  console.log("\n=======================================================");
  console.log("✅ SCHRITT 13 ERFOLGREICH VERIFIZIERT!");
  console.log("   - Webseiten-Liste Tabelle: URL + „wofür“");
  console.log("   - Formatierung als Markdown-Kontext-Tabelle");
  console.log("   - Physische Workspace-Sync in WEBSITES.md & websites.json");
  console.log("   - Postgres DB Speicherung (website_list jsonb)");
  console.log("   - Vollständige HTTP-CRUD Endpunkte");
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
