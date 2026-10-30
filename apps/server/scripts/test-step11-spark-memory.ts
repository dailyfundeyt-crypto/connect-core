import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  saveAgentScopes,
  accessForBot,
  brainRootFor,
  brainRootFromEnv,
  resolveBrainRoot,
  coreOf,
  readAgents,
  type BrainAgentEntry,
} from "../src/brain/store";
import {
  assertAllowed,
  canRead,
  canWrite,
  BrainDenied,
} from "../src/brain/policy";
import { getAgentMap, generateAndWriteAgentMap } from "../src/brain/maps";
import {
  getAgentWorkspaceDir,
  syncAgentMapToWorkspace,
} from "../src/agent-hub/agent-terminal-manager";
import { getAgentCliConfigDirs } from "../src/agent-hub/codex-accounts";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 11: SPARK-GEDÄCHTNIS, RECHTE-DURCHSETZUNG & MAP-DATEI ===\n");

  const testAgentId = "agent_test_step11_" + Date.now();
  const testSlug = "connect-test-spark-" + Date.now();

  console.log("1. Brain-Verbindung prüfen:");
  const configured = brainRootFor(null);
  const brain = await resolveBrainRoot(configured);
  if (!brain.available) {
    throw new Error("Brain nicht verfügbar: " + (brain.reason || "unbekannt"));
  }
  const core = coreOf(brain.root);
  console.log("   - Brain-Root:", brain.root);
  console.log("   - Brain-Core:", core);

  console.log("\n2. Erstelle Test-Agent in Postgres:");
  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, spark_permissions, created_at, updated_at) VALUES ('" +
      testAgentId +
      "', 'Test-Spark-Agent', 'built_in', '{}', 'antigravity', 'dailyfunde.yt@gmail.com', '{}', NOW(), NOW())",
  );
  console.log("   - DB-Agent angelegt:", testAgentId);

  console.log("\n3. Speichere Spark-Berechtigungen (Bereiche + spezifische Ordner/Dateien) via saveAgentScopes:");
  const initialFiles = [
    { path: "Knowledge/Spark/", read: true, write: true },
    { path: "Projects/Projekt Spark.md", read: true, write: true },
    { path: "Vault/Spark/", read: true, write: false },
    { path: "Shared/Sperrdatei.md", read: false },
  ];

  const saveRes = await saveAgentScopes(core, {
    slug: testSlug,
    name: "Test-Spark-Agent",
    kind: "connect",
    connectAgentId: testAgentId,
    read: ["Shared", "Projects", "Memory:eigen", "Projekt:spark"],
    write: ["Memory:eigen", "Inbox", "Projekt:spark"],
    files: initialFiles,
  });

  console.log("   - saveAgentScopes Commit:", saveRes.commit || "OK");
  console.log("   - Agent Slug:", saveRes.agent.slug);
  console.log("   - Gespeicherte Datei-Regeln:", saveRes.agent.files?.length);

  console.log("\n4. Verifiziere Postgres DB-Sync (agents.spark_permissions):");
  const [dbRow] = await sql.unsafe(
    "SELECT spark_permissions FROM agents WHERE id = $1",
    [testAgentId],
  );
  const dbPerms = typeof dbRow?.spark_permissions === "string" ? JSON.parse(dbRow.spark_permissions) : dbRow?.spark_permissions;
  console.log("   - Raw dbRow:", JSON.stringify(dbRow));
  console.log("   - Postgres hat spark_permissions:", Boolean(dbPerms));
  console.log("   - Postgres read Bereiche:", dbPerms?.read?.join(", "));
  console.log("   - Postgres files Regeln:", dbPerms?.files?.length);
  const sparkFolderRule = dbPerms?.files?.find((f: any) => f.path === "Knowledge/Spark/");
  if (!sparkFolderRule || sparkFolderRule.read !== true || sparkFolderRule.write !== true) {
    throw new Error("Fehler: Knowledge/Spark/ Regel nicht korrekt in Postgres!");
  }
  console.log("   - Postgres Knowledge/Spark/ Regel korrekt: OK");

  console.log("\n5. Verifiziere Server-Rechte-Durchsetzung (assertAllowed & canRead/canWrite):");
  const agentsFile = await readAgents(core);
  const projects = agentsFile.projects;
  const agentEntry: BrainAgentEntry = saveRes.agent;

  // Test A: Knowledge/Spark/ Notiz lesen -> ERLAUBT
  const readSparkArea = assertAllowed(agentEntry, "Knowledge/Spark/Ideen.md", "read", true, projects);
  console.log("   - Test A: assertAllowed(Knowledge/Spark/Ideen.md, read) ->", readSparkArea);

  // Test B: Knowledge/Spark/ Notiz neu anlegen -> ERLAUBT (write: true)
  const writeSparkArea = assertAllowed(agentEntry, "Knowledge/Spark/NeueIdee.md", "create", false, projects);
  console.log("   - Test B: assertAllowed(Knowledge/Spark/NeueIdee.md, create) ->", writeSparkArea);

  // Test C: Vault/Spark/ Notiz lesen -> ERLAUBT (Datei-Regel Vault/Spark/)
  const readVaultArea = assertAllowed(agentEntry, "Vault/Spark/Tagebuch.md", "read", true, projects);
  console.log("   - Test C: assertAllowed(Vault/Spark/Tagebuch.md, read) ->", readVaultArea);

  // Test D: Vault/Spark/ Notiz schreiben -> MUSS ABGELEHNT WERDEN (Vault schreibgeschützt)
  let vaultWriteRejected = false;
  try {
    assertAllowed(agentEntry, "Vault/Spark/Tagebuch.md", "create", false, projects);
  } catch (err) {
    if (err instanceof BrainDenied) {
      vaultWriteRejected = true;
      console.log("   - Test D: Vault-Schreiben abgelehnt (korrekt):", err.message);
    }
  }
  if (!vaultWriteRejected) throw new Error("Fehler: Schreiben in Vault/Spark/ wurde nicht abgewiesen!");

  // Test E: Shared/Sperrdatei.md lesen -> MUSS ABGELEHNT WERDEN (read: false überschreibt Shared)
  let sperrdateiRejected = false;
  try {
    assertAllowed(agentEntry, "Shared/Sperrdatei.md", "read", true, projects);
  } catch (err) {
    if (err instanceof BrainDenied) {
      sperrdateiRejected = true;
      console.log("   - Test E: Sperrdatei-Lesen abgelehnt (korrekt):", err.message);
    }
  }
  if (!sperrdateiRejected) throw new Error("Fehler: Sperrdatei wurde nicht durch Datei-Regel gesperrt!");

  // Test F: canRead und canWrite
  const canReadSparkSub = canRead(agentEntry, "Knowledge/Spark/Subfolder/Note.md", projects);
  const canReadSperr = canRead(agentEntry, "Shared/Sperrdatei.md", projects);
  console.log("   - Test F1: canRead(Knowledge/Spark/Subfolder/Note.md) =", canReadSparkSub);
  console.log("   - Test F2: canRead(Shared/Sperrdatei.md) =", canReadSperr);
  if (!canReadSparkSub || canReadSperr) {
    throw new Error("Fehler: canRead policy inkonsistent!");
  }

  console.log("\n6. Verifiziere Eigene Map-Datei (Maps/${slug}.md):");
  const brainMapPath = join(core, "Maps", `${testSlug}.md`);
  const brainMapExists = existsSync(brainMapPath);
  console.log("   - Maps/" + testSlug + ".md physisch vorhanden:", brainMapExists);
  if (!brainMapExists) throw new Error("Fehler: Agent-Map-Datei wurde im Brain nicht angelegt!");

  const mapContent = readFileSync(brainMapPath, "utf8");
  console.log("   - Map enthält Titel:", mapContent.includes(`Karte ${testSlug}`));
  console.log("   - Map enthält Datei-Regeln Überschrift:", mapContent.includes("## Datei-Regeln"));
  console.log("   - Map enthält Knowledge/Spark/:", mapContent.includes("Knowledge/Spark/"));
  console.log("   - Map enthält Projects/Projekt Spark.md:", mapContent.includes("Projects/Projekt Spark.md"));
  console.log("   - Map enthält Vault/Spark/:", mapContent.includes("Vault/Spark/"));

  console.log("\n7. Verifiziere Workspace-Provisionierung der Map-Datei (%LOCALAPPDATA%\\ConnectAgents\\...\\MAP.md):");
  const workspaceDir = getAgentWorkspaceDir(testAgentId);
  const workspaceMapPath = join(workspaceDir, "MAP.md");
  const wsMapExists = existsSync(workspaceMapPath);
  console.log("   - Workspace MAP.md vorhanden:", wsMapExists);
  if (!wsMapExists) throw new Error("Fehler: Workspace MAP.md wurde nicht provisioniert!");

  const wsMapContent = readFileSync(workspaceMapPath, "utf8");
  console.log("   - Brain-Map Länge:", mapContent.length, "Workspace-Map Länge:", wsMapContent.length);
  if (wsMapContent !== mapContent) {
    console.log("Brain-Map:", JSON.stringify(mapContent.slice(0, 150)));
    console.log("Workspace-Map:", JSON.stringify(wsMapContent.slice(0, 150)));
    throw new Error("Fehler: Workspace MAP.md weicht von Brain-Map ab!");
  }

  console.log("\n8. Cleanup Test-Agent, Map-Dateien & DB-Row:");
  // Entferne Agent aus agents.json
  const fileAfter = await readAgents(core);
  const remainingAgents = fileAfter.agents.filter((a) => a.slug !== testSlug);
  const targetJson = join(core, "agents.json");
  const parsedRaw = JSON.parse(readFileSync(targetJson, "utf8"));
  parsedRaw.agents = remainingAgents;
  const { writeFileSync, unlinkSync } = await import("node:fs");
  writeFileSync(targetJson, JSON.stringify(parsedRaw, null, 2) + "\n", "utf8");
  console.log("   - agents.json bereinigt: OK");

  // Entferne erzeugte Maps-Datei
  if (existsSync(brainMapPath)) {
    unlinkSync(brainMapPath);
    console.log("   - Brain Maps/" + testSlug + ".md gelöscht: OK");
  }

  // Lösche DB-Row
  await sql.unsafe("DELETE FROM agents WHERE id = $1", [testAgentId]);
  console.log("   - Postgres DB-Row gelöscht: OK");

  // Lösche Workspace
  const paths = getAgentCliConfigDirs(testAgentId, "dailyfunde.yt@gmail.com");
  if (existsSync(paths.agentBase)) {
    rmSync(paths.agentBase, { recursive: true, force: true });
    console.log("   - Workspace-Verzeichnis gelöscht: OK");
  }

  await sql.end();
  console.log("\n✅ ALLE SCHRITT 11 TESTS ERFOLGREICH BESTANDEN!");
}

runTest().catch((err) => {
  console.error("Testfehler:", err);
  process.exit(1);
});
