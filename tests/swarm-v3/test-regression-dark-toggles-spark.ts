import {
  THEME_DEFAULT,
  ThemeDefaultSchema,
  CompanyAppToggleSchema,
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
} from "../../packages/contracts/src/swarm-v3/types";
import { SWARM_V3_MCP_TOOLS, SWARM_V3_GRANT_SCOPES } from "../../packages/contracts/src/swarm-v3/mcp";

async function runRegressionTests() {
  console.log("=== [REGRESSION TEST] Dark-Default (Lane 1), App-Toggles (Lane 2), Spark-Tools (Lane 3) ===");

  // -------------------------------------------------------------
  // 1. Lane 1: Dark Mode Default Regression
  // -------------------------------------------------------------
  console.log("1. Validating Lane 1 Dark Mode Defaults...");
  if (THEME_DEFAULT !== "dark") {
    throw new Error(`CRITICAL REGRESSION: THEME_DEFAULT is '${THEME_DEFAULT}', must be 'dark'`);
  }
  ThemeDefaultSchema.parse("dark");

  let lightRejected = false;
  try {
    ThemeDefaultSchema.parse("light");
  } catch {
    lightRejected = true;
  }
  if (!lightRejected) {
    throw new Error("ThemeDefaultSchema unexpectedly accepted 'light' as valid default!");
  }
  console.log("  [PASS] Lane 1 Dark Mode default verified ('dark').");

  // -------------------------------------------------------------
  // 2. Lane 2: Company App Toggles Regression
  // -------------------------------------------------------------
  console.log("2. Validating Lane 2 Company App Toggles...");
  const validToggle = CompanyAppToggleSchema.parse({
    companyId: "comp_cnt_gmbh",
    appId: "app_council_room",
    enabled: true,
    sort: 1,
    appName: "Council Room",
  });
  if (validToggle.enabled !== true || validToggle.sort !== 1) {
    throw new Error("CompanyAppToggleSchema failed to preserve properties");
  }

  // Test defaults
  const defaultToggle = CompanyAppToggleSchema.parse({
    companyId: "comp_cnt_gmbh",
    appId: "app_simulation_studio",
  });
  if (defaultToggle.enabled !== true || defaultToggle.sort !== 0) {
    throw new Error("CompanyAppToggle default values violated");
  }
  console.log("  [PASS] Lane 2 CompanyAppToggle contract verified.");

  // -------------------------------------------------------------
  // 3. Lane 3: Spark MCP Tools & Schemas Regression
  // -------------------------------------------------------------
  console.log("3. Validating Lane 3 Spark Browser-Folders, Links & Notes MCP Tools...");
  const sparkTools = SWARM_V3_MCP_TOOLS.spark;
  const requiredTools = [
    "folderCreate",
    "folderList",
    "folderUpdate",
    "folderDelete",
    "linkAdd",
    "linkMove",
    "noteCreate",
    "noteRead",
    "noteAttach",
  ] as const;

  for (const t of requiredTools) {
    if (!sparkTools[t] || !sparkTools[t].startsWith("spark.")) {
      throw new Error(`Missing canonical Spark MCP tool: ${t}`);
    }
  }

  if (!SWARM_V3_GRANT_SCOPES.includes("spark:folders:write")) {
    throw new Error("Missing required grant scope 'spark:folders:write'");
  }

  // Validate Spark entity schemas
  BrowserFolderSchema.parse({
    id: "folder_root_knowledge",
    name: "00 A CNT Knowledge",
    kind: "normal",
  });

  FolderLinkSchema.parse({
    id: "link_acquisition_models",
    folderId: "folder_root_knowledge",
    url: "https://acquisition.com/training/money",
    title: "100M Money Models Official Resource",
  });

  FolderNoteSchema.parse({
    folderId: "folder_root_knowledge",
    noteId: "note_100m_intro",
    title: "100M Overview",
    content: "Overview note content",
  });

  console.log("  [PASS] Lane 3 Spark MCP tools and entity schemas verified.");

  console.log("=== ALL REGRESSION TESTS PASSED ===\n");
}

runRegressionTests().catch((err) => {
  console.error("Regression test failed:", err);
  process.exit(1);
});
