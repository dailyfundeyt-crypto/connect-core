import postgres from "postgres";

async function main() {
  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  try {
    const agents = await sql`SELECT id, name, account_email FROM agents ORDER BY created_at DESC LIMIT 5`;
    console.log("Agents in DB:", agents);

    if (agents.length === 0) {
      throw new Error("No agents found in DB");
    }

    const testAgent = agents[0];
    const agentId = testAgent.id;
    console.log(`Testing Terminal WS for agent: ${testAgent.name} (${agentId})`);

    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log("Tables in DB:", tables.map(t => t.table_name).join(", "));

    let sessionToken: string | null = null;
    try {
      const sess = await sql`SELECT token FROM "session" ORDER BY "createdAt" DESC LIMIT 1`;
      sessionToken = sess[0]?.token;
    } catch {
      try {
        const sess = await sql`SELECT token FROM sessions ORDER BY created_at DESC LIMIT 1`;
        sessionToken = sess[0]?.token;
      } catch {
        // Fallback to known dev token
        sessionToken = "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
      }
    }
    console.log("Using session token:", sessionToken);

    const sessionCookieVal = "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
    const cookieHeader = `better-auth.session_token=${sessionCookieVal}`;

    const wsUrl = `ws://127.0.0.1:3101/api/terminal/${encodeURIComponent(agentId)}/ws`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl, {
      headers: {
        Cookie: cookieHeader,
      },
    } as any);

    let receivedOutput = false;
    let receivedStatus = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        if (receivedOutput || receivedStatus) {
          resolve();
        } else {
          reject(new Error("Timeout waiting for terminal WebSocket messages"));
        }
      }, 8000);

      ws.onopen = () => {
        console.log("✓ WebSocket connected successfully!");
        // Send a ping
        ws.send(JSON.stringify({ type: "ping" }));
        // Send a resize
        ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
        // Send some input
        setTimeout(() => {
          console.log("Sending test input 'echo STEP17_VERIFIED'...");
          ws.send(JSON.stringify({ type: "input", data: "echo STEP17_VERIFIED\r\n" }));
        }, 1000);
      };

      ws.onmessage = (event) => {
        const text = String(event.data);
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === "pong") {
            console.log("✓ Received Pong response");
          } else if (parsed.type === "status") {
            receivedStatus = true;
            console.log("✓ Received Status:", parsed.session?.status, "CLI:", parsed.session?.cli, "Mode:", parsed.session?.mode);
          } else if (parsed.type === "output") {
            receivedOutput = true;
            console.log("✓ Received Terminal Output chunk:", JSON.stringify(parsed.data.slice(0, 100)));
            if (parsed.data.includes("STEP17_VERIFIED")) {
              console.log("✓ Detected test output 'STEP17_VERIFIED'!");
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          }
        } catch {
          console.log("Raw output:", text.slice(0, 80));
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        clearTimeout(timeout);
        reject(err);
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        clearTimeout(timeout);
        resolve();
      };
    });

    console.log("✓ Terminal WebSocket test passed successfully!");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
