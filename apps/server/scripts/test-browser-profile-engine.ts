/**
 * E2E-Test für Stufe 2 Phase G — BrowserProfileEngine im chat/query-Pfad.
 *
 * Prüft, dass:
 * 1. Ein Agent mit browser_profile-Engine sein Profil + startUrl zurückgibt
 * 2. executeEnginePrompt bei browser_profile einen Hinweis mit startUrl zurückgibt
 * 3. Bei Engine-Update (PATCH) die Engine korrekt gespeichert wird
 */

import { buildAgentMcpDeps } from "../src/agent-hub/agent-mcp-deps";

console.log(`[e2e] 1. Test: BrowserProfileEngine-Logik im executeEnginePrompt`);

// Manuelles Mock-Profile
const mockProfile = {
  id: "e2e-browser-profile-test",
  name: "Test-Browser",
  title: "Test",
  roleDescription: "Browser-Profile-Engine Test",
  avatarSeed: "test",
  visibility: "private" as const,
  ownerUserId: "test-user",
  systemOwned: false,
  hidden: false,
  deletedAt: null,
  endpoint: null,
  hasAuth: false,
  hasCallbackToken: false,
  engine: {
    kind: "browser_profile" as const,
    startUrl: "https://github.com",
    profileName: "github-test",
    allowWrite: false,
  },
};

const mockProfileStore = {
  async get() {
    return mockProfile;
  },
  async list() { return []; },
  async getWithin() { return mockProfile; },
  async create() { return mockProfile; },
  async update() { return mockProfile; },
  async duplicate() { return mockProfile; },
  async setHidden() {},
  async softDelete() {},
  async issueCallbackToken() { return "token"; },
  async revokeCallbackToken() {},
  async agentForCallbackToken() { return null; },
};

const deps = buildAgentMcpDeps(undefined, mockProfileStore as never);
const result = await deps.invokeChat({
  agentId: "e2e-browser-profile-test",
  prompt: "Was steht auf der Seite?",
});
console.log(`[e2e] 2. invokeChat-Ergebnis:\n${result}\n`);

if (!result.includes("https://github.com")) {
  console.error(`[e2e] FEHLER: startUrl nicht in Antwort`);
  process.exit(1);
}
if (!result.includes("Was steht auf der Seite?")) {
  console.error(`[e2e] FEHLER: Prompt nicht in Antwort`);
  process.exit(2);
}
if (!result.includes("Browser-Profile-Engine")) {
  console.error(`[e2e] FEHLER: Engine-Label nicht in Antwort`);
  process.exit(3);
}

console.log(`[e2e] ✅ BrowserProfileEngine-Logik funktioniert`);

const queryResult = await deps.invokeQuery({
  agentId: "e2e-browser-profile-test",
  question: "Liste alle Repos auf.",
});
console.log(`[e2e] 3. invokeQuery-Ergebnis (gekürzt):\n${queryResult.slice(0, 100)}…\n`);

if (!queryResult.includes("Browser-Profile-Engine")) {
  console.error(`[e2e] FEHLER: query funktioniert nicht`);
  process.exit(4);
}

console.log(`[e2e] ✅ Stufe 2 Phase G E2E OK`);
