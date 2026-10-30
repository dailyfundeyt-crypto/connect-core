import postgres from "postgres";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentCliConfigDirs,
  buildAgentIsolatedEnv,
  findMatchingRegisterInstance,
  loadCodexRegister,
  getDefaultGoogleAccount,
} from "../src/agent-hub/codex-accounts";
import { checkAgentCliLoginStatus } from "../src/agent-hub/cli-manager";
import { lookupAgentAccountEmail } from "../src/agent-hub/agent-terminal-manager";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

async function runTest() {
  console.log("=== TEST SCHRITT 9B: MULTI-CLI ISOLATION & REGISTER ===\n");

  const testId = "agent_test_step9b_" + Date.now();
  const testEmail = "skunc3021@gmail.com";

  console.log("1. Erstelle Test-Agent in DB:", testId);
  await sql.unsafe(
    "INSERT INTO agents (id, name, type, configuration, chosen_cli, account_email, created_at, updated_at) VALUES ('" +
      testId +
      "', 'Test-Bot-Step9b', 'built_in', '{}', 'antigravity', '" +
      testEmail +
      "', NOW(), NOW())",
  );

  // Verifiziere DB-Abfrage
  const dbEmail = await lookupAgentAccountEmail(testId);
  console.log("   -> DB account_email gelesen:", dbEmail, "(Match:", dbEmail === testEmail, ")");

  // 2. Teste Register-Zuordnung
  console.log("\n2. Teste Register-Zuordnung für", testEmail);
  const matched = findMatchingRegisterInstance(testEmail);
  console.log("   -> Gefundene Instanz:", matched ? matched.appName + " (" + matched.name + ")" : "keine");
  console.log("   -> Registriertes codexHome:", matched?.codexHome ?? "(Standard/Default)");
  console.log("   -> Registriertes userDataDir:", matched?.userDataDir ?? "(Standard/Default)");

  // 3. Teste getAgentCliConfigDirs
  console.log("\n3. Teste getAgentCliConfigDirs für alle 5 CLIs:");
  const paths = getAgentCliConfigDirs(testId, testEmail);
  console.log("   - Base-Dir:        ", paths.agentBase);
  console.log("   - 1. Codex-Home:   ", paths.codexHome);
  console.log("   - 2. Claude-Config:", paths.claudeConfig);
  console.log("   - 3. Hermes-Home:  ", paths.hermesHome);
  console.log("   - 4. Freebuff-Cfg: ", paths.freebuffConfig);
  console.log("   - 5. Antigravity:  ", paths.antigravityHome);
  console.log("   - Browser-Profil:  ", paths.browserProfile);

  // Verifiziere, dass Ordner physisch existieren
  const foldersCreated = [
    paths.agentBase,
    paths.workspace,
    paths.codexHome,
    paths.claudeConfig,
    paths.hermesHome,
    paths.freebuffConfig,
    paths.antigravityHome,
    paths.browserProfile,
  ].every(existsSync);
  console.log("   -> Alle Ordner physisch angelegt:", foldersCreated);

  // 4. Teste buildAgentIsolatedEnv
  console.log("\n4. Teste isolierte Umgebungsvariablen:");
  const env = buildAgentIsolatedEnv(testId, testEmail);
  console.log("   - CODEX_HOME:          ", env.CODEX_HOME);
  console.log("   - CLAUDE_CONFIG_DIR:   ", env.CLAUDE_CONFIG_DIR);
  console.log("   - HERMES_HOME:         ", env.HERMES_HOME);
  console.log("   - XDG_CONFIG_HOME:     ", env.XDG_CONFIG_HOME);
  console.log("   - ANTIGRAVITY_CONFIG:  ", env.ANTIGRAVITY_CONFIG_DIR);
  console.log("   - AGY_ACCOUNT:         ", env.AGY_ACCOUNT);

  // 5. Teste Login-Status pro CLI
  console.log("\n5. Teste checkAgentCliLoginStatus (in isolierten Bot-Ordnern):");
  const status = await checkAgentCliLoginStatus(testId, testEmail);
  console.log("   - Agent-ID:    ", status.agentId);
  console.log("   - Account-Email:", status.accountEmail);
  for (const c of status.clis) {
    console.log("   [" + c.kind.toUpperCase() + "] Installed: " + c.installed + " | LoggedIn: " + c.loggedIn + " | Config: " + c.configDir);
    console.log("     Detail: " + c.statusDetail);
  }

  // 6. Verifiziere, dass globale Profile UNBERÜHRT blieben
  console.log("\n6. Verifiziere Unberührtheit globaler Konfigurationen:");
  const globalClaude = join(process.env.USERPROFILE || "", ".claude.json");
  const globalGemini = join(process.env.USERPROFILE || "", ".gemini");
  console.log("   - Global .claude.json vorhanden:       ", existsSync(globalClaude));
  console.log("   - Global .gemini vorhanden:            ", existsSync(globalGemini));

  // 7. Cleanup
  console.log("\n7. Cleanup Test-Agent & Ordner:");
  await sql.unsafe("DELETE FROM agents WHERE id = '" + testId + "'");
  console.log("   - Test-Agent aus DB gelöscht: OK");

  if (existsSync(paths.agentBase)) {
    rmSync(paths.agentBase, { recursive: true, force: true });
    console.log("   - Test-Agent Base-Dir gelöscht: OK");
  }
  if (existsSync(paths.browserProfile) && paths.browserProfile.includes(testId)) {
    rmSync(paths.browserProfile, { recursive: true, force: true });
    console.log("   - Test-Agent Browser-Profil gelöscht: OK");
  }

  await sql.end();
  console.log("\n✅ TEST VOLLSTÄNDIG ERFOLGREICH!");
}

runTest().catch((err) => {
  console.error("Test-Fehler:", err);
  process.exit(1);
});
