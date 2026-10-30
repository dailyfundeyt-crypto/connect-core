/**
 * Live-Prüfung der Thread- und Turn-Methoden gegen den Sidecar.
 *
 * Lane: A03 (Welle W1).
 *
 * Erzeugt **einen** leeren Thread im T3-Home und liest den Snapshot zurück.
 * Das ist ein Schreibvorgang gegen die eigene T3-Home
 * (`%LOCALAPPDATA%\ConnectAgents\t3-home`) — Stefan entscheidet, ob das so
 * bleiben soll.
 */

import { T3RpcClient } from "../client";

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";

const client = new T3RpcClient({
  origin,
  bearerToken: process.env.T3_BEARER_TOKEN ?? null,
});

const threadId = `a03-livecheck-${Date.now().toString(36)}`;

try {
  await client.connect();

  const created = await client.createThread({
    commandId: `cmd-${Date.now().toString(36)}`,
    threadId,
    projectId: "a03-livecheck-project",
    title: "A03 Live-Check",
    provider: "codex",
    model: "gpt-6-luna",
  });
  console.log("createThread:", JSON.stringify(created).slice(0, 800));

  const snapshot = await client.getThreadSnapshot({ threadId });
  console.log("snapshot.thread:", JSON.stringify(snapshot.thread).slice(0, 400));
  console.log("snapshot.runs:", snapshot.runs?.length ?? 0);
} catch (error) {
  console.error("Fehler:", error);
} finally {
  client.close();
}

export {};
