import postgres from "postgres";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

const sessionCookieVal =
  "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
const authHeaders = {
  "Content-Type": "application/json",
  Cookie: `better-auth.session_token=${sessionCookieVal}`,
};

async function main() {
  console.log("=== HTTP API INTEGRATIONSTEST SCHRITT 15 AUF PORT 3101 ===\n");

  const targetAgentId = "agent_a2657859-d47a-428e-95eb-b48f81faf71b";

  // 1. GET /api/agents/:id/cli-mcp
  console.log("1. GET /api/agents/:id/cli-mcp (Antigravity):");
  const getRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${targetAgentId}/cli-mcp?cli=antigravity`,
    { headers: authHeaders },
  );
  console.log("   - Status:", getRes.status);
  if (!getRes.ok) throw new Error(`GET fehlgeschlagen: ${getRes.status}`);
  const getData = (await getRes.json()) as any;
  console.log("   - CLI:", getData.cli);
  console.log("   - Datei auf Platte:", getData.configFilePath);
  console.log("   - Server-Anzahl:", getData.servers?.length);
  console.log("   - Format:", getData.format);
  if (!getData.servers || getData.servers.length === 0) {
    throw new Error("Fehler: Keine Server in der CLI-Config geliefert!");
  }
  console.log("   -> GET erfolgreich: OK\n");

  // 2. POST /api/agents/:id/cli-mcp/server (Neuen Server eintragen)
  console.log("2. POST /api/agents/:id/cli-mcp/server:");
  const postRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${targetAgentId}/cli-mcp/server`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        cli: "antigravity",
        server: {
          id: "step15-test-server",
          name: "Schritt 15 Test MCP",
          type: "http",
          url: "http://localhost:3101/api/connect-mcp/test/jsonrpc",
          description: "Automatischer HTTP-Testserver",
          enabled: true,
        },
      }),
    },
  );
  console.log("   - Status:", postRes.status);
  if (!postRes.ok) throw new Error(`POST server fehlgeschlagen: ${postRes.status}`);
  const postData = (await postRes.json()) as any;
  console.log("   - Eingetragen:", postData.server?.id);
  const found = postData.config?.servers?.find((s: any) => s.id === "step15-test-server");
  if (!found) throw new Error("Fehler: Server nicht in zurückgegebener Config gefunden!");
  console.log("   -> POST Server erfolgreich: OK\n");

  // 3. POST /api/agents/:id/cli-mcp/toggle (Server umschalten)
  console.log("3. POST /api/agents/:id/cli-mcp/toggle:");
  const toggleRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${targetAgentId}/cli-mcp/toggle`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        cli: "antigravity",
        serverId: "step15-test-server",
        enabled: false,
      }),
    },
  );
  console.log("   - Status:", toggleRes.status);
  if (!toggleRes.ok) throw new Error(`POST toggle fehlgeschlagen: ${toggleRes.status}`);
  const toggleData = (await toggleRes.json()) as any;
  const toggled = toggleData.config?.servers?.find((s: any) => s.id === "step15-test-server");
  if (toggled?.enabled !== false) throw new Error("Fehler: Toggle hat Status nicht auf false gesetzt!");
  console.log("   - Neuer Status (enabled):", toggled.enabled);
  console.log("   -> Toggle erfolgreich: OK\n");

  // 4. PUT /api/agents/:id/cli-mcp/raw (1:1 Raw-Editor)
  console.log("4. PUT /api/agents/:id/cli-mcp/raw:");
  const rawPayload = JSON.stringify(
    {
      mcpServers: {
        flux: {
          type: "http",
          url: "http://localhost:3101/api/connect-mcp/flux/jsonrpc",
          description: "Via Raw-Endpoint aktualisiert",
        },
        spark: {
          type: "http",
          url: "http://localhost:3101/api/connect-mcp/spark/jsonrpc",
          description: "Wissensspeicher",
        },
      },
    },
    null,
    2,
  );
  const rawRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${targetAgentId}/cli-mcp/raw`,
    {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        cli: "antigravity",
        rawContent: rawPayload,
      }),
    },
  );
  console.log("   - Status:", rawRes.status);
  if (!rawRes.ok) throw new Error(`PUT raw fehlgeschlagen: ${rawRes.status}`);
  const rawData = (await rawRes.json()) as any;
  console.log("   - Server nach Raw-Write:", rawData.config?.servers?.length);
  if (rawData.config?.servers?.length !== 2) throw new Error("Fehler: Raw-Content nicht übernommen!");
  console.log("   -> Raw-Writeback erfolgreich: OK\n");

  // 5. POST /api/agents/:id/cli-mcp/sync-all (In alle CLIs spiegeln)
  console.log("5. POST /api/agents/:id/cli-mcp/sync-all:");
  const syncRes = await fetch(
    `http://127.0.0.1:3101/api/agents/${targetAgentId}/cli-mcp/sync-all?cli=antigravity`,
    {
      method: "POST",
      headers: authHeaders,
    },
  );
  console.log("   - Status:", syncRes.status);
  if (!syncRes.ok) throw new Error(`POST sync-all fehlgeschlagen: ${syncRes.status}`);
  const syncData = (await syncRes.json()) as any;
  console.log("   - Gespiegelte CLIs:", syncData.syncedClis?.join(", "));
  console.log("   - Geschriebene Dateien:", syncData.writtenFiles?.length);
  console.log("   -> Sync-All erfolgreich: OK\n");

  console.log("=======================================================");
  console.log("✅ ALLE HTTP-ENDPUNKTE AUF PORT 3101 ERFOLGREICH GETESTET!");
  console.log("=======================================================\n");
}

main()
  .catch((err) => {
    console.error("Testfehler:", err);
    process.exit(1);
  })
  .finally(() => {
    sql.end({ timeout: 1 });
  });
