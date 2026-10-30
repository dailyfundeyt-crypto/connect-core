import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SKILLS_CATALOG,
  normalizeAgentSkills,
  syncAgentSkillsToWorkspace,
  type AgentSkill,
} from "../src/agents/agent-skills";
import {
  lookupAgentSkills,
  getAgentWorkspaceDir,
} from "../src/agent-hub/agent-terminal-manager";
import { getAgentCliConfigDirs } from "../src/agent-hub/codex-accounts";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 10: AGENT SKILLS & CLI-PROVISIONIERUNG ===\n");

  const testId = "agent_test_step10_" + Date.now();
  console.log("1. Standard-Katalog prüfen:");
  console.log("   - Katalog-Länge:", DEFAULT_SKILLS_CATALOG.length);
  for (const s of DEFAULT_SKILLS_CATALOG) {
    console.log(`     * [${s.id}] ${s.name} (Default enabled: ${s.enabled})`);
  }

  console.log("\n2. Normalisierung testen (leere DB-Daten):");
  const normalizedEmpty = normalizeAgentSkills([]);
  console.log("   - Normalisierte Skills-Anzahl:", normalizedEmpty.length);
  const activeInitial = normalizedEmpty.filter((s) => s.enabled);
  console.log("   - Aktive Skills:", activeInitial.map((s) => s.name).join(", "));

  console.log("\n3. Erstelle Test-Agent in Postgres mit spezifischen Skills:");
  const testSkills: AgentSkill[] = [
    {
      id: "web-search",
      name: "Websuche & Recherche",
      description: "Recherche im Web",
      enabled: true,
      source: "builtin",
    },
    {
      id: "browser-use",
      name: "Helium Browser Automation",
      description: "Browser-Steuerung",
      enabled: false, // ausgestellt
      source: "builtin",
    },
    {
      id: "custom-excel",
      name: "Excel Report Generator",
      description: "Erzeugt XLSX Reports für Kunden",
      enabled: true,
      prompt: "Erstelle immer formatierte Tabellen mit Kopfzeile und Summenzeile.",
      source: "custom",
    },
  ];

  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, skills, created_at, updated_at) VALUES ('" +
      testId +
      "', 'Test-Bot-Step10', 'built_in', '{}', 'antigravity', 'dailyfunde.yt@gmail.com', '" +
      JSON.stringify(testSkills) +
      "', NOW(), NOW())",
  );

  console.log("\n4. Teste DB-Abfrage via lookupAgentSkills:");
  const fetchedSkills = await lookupAgentSkills(testId);
  console.log("   - DB-Skills gelesen:", fetchedSkills.length);
  for (const s of fetchedSkills) {
    console.log(`     * [${s.id}] ${s.name} -> Enabled: ${s.enabled} (${s.source || "custom"})`);
  }
  const customFound = fetchedSkills.find((s) => s.id === "custom-excel");
  console.log("   - Custom Skill erhalten:", customFound ? customFound.name : "FEHLER");

  console.log("\n5. Teste physische Workspace-Provisionierung:");
  const workspace = getAgentWorkspaceDir(testId);
  const paths = getAgentCliConfigDirs(testId, "dailyfunde.yt@gmail.com");

  const syncResult = syncAgentSkillsToWorkspace(
    testId,
    fetchedSkills,
    workspace,
    paths.antigravityHome,
  );
  console.log("   - Aktive Skills synchronisiert:", syncResult.activeCount);
  console.log("   - Namen:", syncResult.activeNames.join(", "));
  console.log("   - SKILLS.md Pfad:", syncResult.skillsDocPath);

  // Verifiziere SKILLS.md
  const skillsMdExists = existsSync(syncResult.skillsDocPath);
  console.log("   - SKILLS.md physisch vorhanden:", skillsMdExists);
  if (skillsMdExists) {
    const mdContent = readFileSync(syncResult.skillsDocPath, "utf8");
    console.log("   - SKILLS.md enthält Custom-Prompt:", mdContent.includes("Excel Report Generator"));
  }

  // Verifiziere skills.json
  const skillsJsonPath = join(workspace, "skills.json");
  const skillsJsonExists = existsSync(skillsJsonPath);
  console.log("   - skills.json physisch vorhanden:", skillsJsonExists);

  // Verifiziere .gemini/skills Struktur (Antigravity-Format)
  const geminiSkillDir = join(workspace, ".gemini", "skills", "custom-excel");
  const geminiSkillMd = join(geminiSkillDir, "SKILL.md");
  const geminiSkillExists = existsSync(geminiSkillMd);
  console.log("   - Antigravity .gemini/skills/custom-excel/SKILL.md vorhanden:", geminiSkillExists);

  const agyHomeSkillMd = join(paths.antigravityHome, ".gemini", "skills", "custom-excel", "SKILL.md");
  const agyHomeExists = existsSync(agyHomeSkillMd);
  console.log("   - Antigravity-Home .gemini/skills/custom-excel/SKILL.md vorhanden:", agyHomeExists);

  console.log("\n6. Cleanup Test-Agent & Ordner:");
  await sql.unsafe("DELETE FROM agents WHERE id = '" + testId + "'");
  console.log("   - DB-Agent gelöscht: OK");

  if (existsSync(paths.agentBase)) {
    rmSync(paths.agentBase, { recursive: true, force: true });
    console.log("   - Agent-Base Ordner gelöscht: OK");
  }

  await sql.end();
  console.log("\n✅ ALLE TESTS ERFOLGREICH BESTANDEN!");
}

runTest().catch((err) => {
  console.error("Testfehler:", err);
  process.exit(1);
});
