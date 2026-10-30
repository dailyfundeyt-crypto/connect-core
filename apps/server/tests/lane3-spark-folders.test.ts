import { Hono } from "hono";
import { SparkFoldersStore } from "../src/brain/browser-folders/store";
import { createBrowserFoldersRouter } from "../src/brain/browser-folders/routes";
import { buildSparkFolderTools } from "../src/brain/browser-folders/mcp-tools";
import type { McpGrant } from "../src/contracts/api";

async function runLane3Tests() {
  console.log("=================================================");
  console.log("   LANE 3: SPARK-MCP BROWSER-FOLDERS TESTS       ");
  console.log("=================================================");

  const store = new SparkFoldersStore(undefined); // in-memory store for isolation
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. STORE TESTS
  // ---------------------------------------------------------------------------
  console.log("\n1. Testing SparkFoldersStore operations...");

  // Seed listing
  const initialFolders = await store.listFolders();
  assert(initialFolders.length >= 3, `Initial seed folders present (${initialFolders.length} found)`);

  // Create folder
  const marketingFolder = await store.createFolder({
    name: "Growth Strategies",
    parentId: null,
    kind: "normal",
    ownerScope: "company",
  });
  assert(marketingFolder.name === "Growth Strategies", "Folder created successfully");

  // Create subfolder
  const subFolder = await store.createFolder({
    name: "Social Ad Experiments",
    parentId: marketingFolder.id,
    kind: "normal",
    ownerScope: "company",
  });
  assert(subFolder.parentId === marketingFolder.id, "Subfolder created under parent");

  // Create leaf folder
  const leafFolder = await store.createFolder({
    name: "TikTok Hooks",
    parentId: subFolder.id,
    kind: "normal",
    ownerScope: "company",
  });
  assert(leafFolder.parentId === subFolder.id, "Leaf folder created");

  // Update folder kind to settings
  const settingsFolder = await store.updateFolder(marketingFolder.id, { kind: "settings" });
  assert(settingsFolder.kind === "settings", "Folder kind changed to settings");

  // Cycle prevention test 1: cannot move into self
  let cycleSelfCaught = false;
  try {
    await store.moveFolder(marketingFolder.id, marketingFolder.id);
  } catch (err: any) {
    cycleSelfCaught = err.message.includes("Zyklus");
  }
  assert(cycleSelfCaught, "Cycle prevention: moving folder into itself rejected");

  // Cycle prevention test 2: cannot move ancestor into deep descendant
  let cycleDescendantCaught = false;
  try {
    await store.moveFolder(marketingFolder.id, leafFolder.id);
  } catch (err: any) {
    cycleDescendantCaught = err.message.includes("Zyklus");
  }
  assert(cycleDescendantCaught, "Cycle prevention: moving ancestor into deep descendant rejected");

  // Valid move: move leafFolder directly under marketingFolder
  const movedLeaf = await store.moveFolder(leafFolder.id, marketingFolder.id);
  assert(movedLeaf.parentId === marketingFolder.id, "Valid move: leaf moved under root parent");

  // Link operations
  const link1 = await store.addLink({
    folderId: leafFolder.id,
    url: "https://example.com/tiktok-hook-1",
    title: "100M Hook Blueprint",
  });
  assert(link1.url === "https://example.com/tiktok-hook-1", "Link added to folder");

  const movedLink = await store.moveLink(link1.id, subFolder.id);
  assert(movedLink.folderId === subFolder.id, "Link moved between folders");

  // Note operations & instruction linkage
  const note1 = await store.createNote({
    folderId: subFolder.id,
    title: "Vorgehensweise fuer Ads",
    content: "Diese Links fuer 3-Sekunden Video-Hooks im Instagram-Format auswerten.",
  });
  assert(note1.title === "Vorgehensweise fuer Ads", "Note created and attached to folder");

  // Context test (Rule: Note in folder = Instruction for links in folder)
  const context = await store.getFolderContext(subFolder.id);
  assert(context.folder.id === subFolder.id, "Context returns correct folder");
  assert(context.instructionNote?.noteId === note1.noteId, "Context returns attached instruction note");
  assert(
    context.links[0]?.associatedInstruction.includes("3-Sekunden Video-Hooks"),
    "Context maps instruction from folder note to contained links"
  );

  // Detach note
  await store.detachNote(subFolder.id, note1.noteId);
  const notesAfterDetach = await store.listFolderNotes(subFolder.id);
  assert(!notesAfterDetach.some((n) => n.noteId === note1.noteId), "Note detached successfully");

  // ---------------------------------------------------------------------------
  // 2. REST API TESTS (via Hono router.request)
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing REST-API endpoints...");
  const router = createBrowserFoldersRouter(undefined);
  const app = new Hono();
  app.route("/api/spark/folders", router);

  // GET /api/spark/folders
  const resList = await app.request("/api/spark/folders");
  assert(resList.status === 200, "GET /api/spark/folders returns 200");
  const dataList = await resList.json();
  assert(dataList.success && Array.isArray(dataList.folders), "List response has success=true and folders array");

  // POST /api/spark/folders
  const resCreate = await app.request("/api/spark/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "REST Created Folder", kind: "normal" }),
  });
  assert(resCreate.status === 201, "POST /api/spark/folders returns 201 Created");
  const dataCreate = await resCreate.json();
  const createdFolderId = dataCreate.folder.id;

  // POST /api/spark/folders/links
  const resAddLink = await app.request("/api/spark/folders/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderId: createdFolderId,
      url: "https://news.ycombinator.com",
      title: "Hacker News",
    }),
  });
  assert(resAddLink.status === 201, "POST /api/spark/folders/links returns 201");
  const dataLink = await resAddLink.json();
  const linkId = dataLink.link.id;

  // POST /api/spark/folders/notes/attach
  const resAttachNote = await app.request("/api/spark/folders/notes/attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderId: createdFolderId,
      noteId: "note_rest_instruction",
      title: "HN Processing Note",
      content: "Scrape top 10 articles daily and summarize in Spark.",
      setAsInstruction: true,
    }),
  });
  assert(resAttachNote.status === 200, "POST /api/spark/folders/notes/attach returns 200");

  // GET /api/spark/folders/:id/context
  const resContext = await app.request(`/api/spark/folders/${createdFolderId}/context`);
  assert(resContext.status === 200, "GET /api/spark/folders/:id/context returns 200");
  const dataContext = await resContext.json();
  assert(
    dataContext.context.links[0]?.associatedInstruction.includes("Scrape top 10 articles"),
    "REST Context maps instruction to link"
  );

  // POST /api/spark/folders/move with cycle error check
  const resMoveCycle = await app.request("/api/spark/folders/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderId: createdFolderId,
      targetParentId: createdFolderId,
    }),
  });
  assert(resMoveCycle.status === 400, "POST /api/spark/folders/move detects cycle and returns 400");

  // DELETE link
  const resDelLink = await app.request(`/api/spark/folders/links/${linkId}`, { method: "DELETE" });
  assert(resDelLink.status === 200, "DELETE /api/spark/folders/links/:id returns 200");

  // DELETE folder
  const resDelFolder = await app.request(`/api/spark/folders/${createdFolderId}`, { method: "DELETE" });
  assert(resDelFolder.status === 200, "DELETE /api/spark/folders/:id returns 200");

  // ---------------------------------------------------------------------------
  // 3. MCP TOOLS TESTS
  // ---------------------------------------------------------------------------
  console.log("\n3. Testing MCP Tools (all 13 tools)...");
  const writeGrant: McpGrant = {
    id: "grant_agent_3",
    companyId: "comp_kunc",
    agentName: "Agent 3",
    tokenHash: "hash_3",
    scopes: ["spark:folders:write"],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const readOnlyGrant: McpGrant = {
    id: "grant_readonly",
    companyId: "comp_kunc",
    agentName: "Read Agent",
    tokenHash: "hash_ro",
    scopes: ["other:scope"],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mcpTools = buildSparkFolderTools({ store, grant: writeGrant });
  const roTools = buildSparkFolderTools({ store, grant: readOnlyGrant });

  assert(mcpTools.length === 13, `All 13 MCP tools registered (got ${mcpTools.length})`);

  // Helper to execute MCP tool
  async function callMcp(toolsList: typeof mcpTools, name: string, args: any) {
    const t = toolsList.find((x) => x.name === name);
    if (!t) throw new Error(`MCP tool "${name}" not found`);
    const res = await t.handler(args);
    const text = res.content[0]?.text || "";
    try {
      return { isError: res.isError, data: JSON.parse(text) };
    } catch {
      return { isError: res.isError, raw: text };
    }
  }

  // Permission test: write with read-only grant must fail
  const roCreateRes = await callMcp(roTools, "spark.folder_create", { name: "Unauthorized Folder" });
  assert(roCreateRes.isError === true, "MCP tool enforces spark:folders:write scope denial");

  // 1. spark.folder_create
  const mcpCreated = await callMcp(mcpTools, "spark.folder_create", {
    name: "MCP Research Vault",
    kind: "normal",
  });
  assert(mcpCreated.data.success && mcpCreated.data.folder.id, "spark.folder_create succeeded");
  const mcpFolderId = mcpCreated.data.folder.id;

  // 2. spark.folder_list
  const mcpList = await callMcp(mcpTools, "spark.folder_list", {});
  assert(mcpList.data.success && mcpList.data.count > 0, "spark.folder_list succeeded");

  // 3. spark.folder_update
  const mcpUpdated = await callMcp(mcpTools, "spark.folder_update", {
    folderId: mcpFolderId,
    name: "MCP Research Vault (Updated)",
  });
  assert(mcpUpdated.data.folder.name === "MCP Research Vault (Updated)", "spark.folder_update succeeded");

  // 4. spark.folder_set_kind
  const mcpKind = await callMcp(mcpTools, "spark.folder_set_kind", {
    folderId: mcpFolderId,
    kind: "settings",
  });
  assert(mcpKind.data.folder.kind === "settings", "spark.folder_set_kind succeeded");

  // 5. spark.folder_move
  const mcpMove = await callMcp(mcpTools, "spark.folder_move", {
    folderId: mcpFolderId,
    targetParentId: null,
  });
  assert(mcpMove.data.success, "spark.folder_move succeeded");

  // 6. spark.link_add
  const mcpLink = await callMcp(mcpTools, "spark.link_add", {
    folderId: mcpFolderId,
    url: "https://acquisition.com",
    title: "Acquisition.com",
  });
  assert(mcpLink.data.link.url === "https://acquisition.com", "spark.link_add succeeded");
  const mcpLinkId = mcpLink.data.link.id;

  // 7. spark.link_move
  const mcpLinkMoved = await callMcp(mcpTools, "spark.link_move", {
    linkId: mcpLinkId,
    targetFolderId: mcpFolderId,
  });
  assert(mcpLinkMoved.data.success, "spark.link_move succeeded");

  // 8. spark.note_create
  const mcpNote = await callMcp(mcpTools, "spark.note_create", {
    folderId: mcpFolderId,
    title: "Framework Notiz",
    content: "Alex Hormozi $100M Money Models Framework analysieren.",
  });
  assert(mcpNote.data.note.noteId, "spark.note_create succeeded");
  const mcpNoteId = mcpNote.data.note.noteId;

  // 9. spark.note_read
  const mcpNoteRead = await callMcp(mcpTools, "spark.note_read", { noteId: mcpNoteId });
  assert(mcpNoteRead.data.note.content.includes("Alex Hormozi"), "spark.note_read succeeded");

  // 10. spark.note_attach
  const mcpAttach = await callMcp(mcpTools, "spark.note_attach", {
    folderId: mcpFolderId,
    noteId: mcpNoteId,
    setAsInstruction: true,
  });
  assert(mcpAttach.data.success, "spark.note_attach succeeded");

  // 11. spark.folder_context
  const mcpContext = await callMcp(mcpTools, "spark.folder_context", { folderId: mcpFolderId });
  assert(
    mcpContext.data?.context?.links[0]?.associatedInstruction?.includes("Alex Hormozi"),
    "spark.folder_context succeeded and mapped instructions to links"
  );

  // 12. spark.note_detach
  const mcpDetach = await callMcp(mcpTools, "spark.note_detach", {
    folderId: mcpFolderId,
    noteId: mcpNoteId,
  });
  assert(mcpDetach.data.detached === true, "spark.note_detach succeeded");

  // 13. spark.folder_delete
  const mcpDelete = await callMcp(mcpTools, "spark.folder_delete", { folderId: mcpFolderId });
  assert(mcpDelete.data.deleted === true, "spark.folder_delete succeeded");

  console.log("\n=================================================");
  console.log(`  RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runLane3Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
