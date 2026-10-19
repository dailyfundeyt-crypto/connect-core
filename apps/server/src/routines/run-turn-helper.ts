/**
 * MCP-Turn-Helper: führt einen einzelnen Agent-Turn aus und liefert die
 * letzte Assistant-Nachricht.
 *
 * Stufe 1 ist absichtlich ein klarer Stub. Sie meldet, dass das System
 * prinzipiell funktioniert (der MCP-Endpoint, das Auth-Gate, die
 * Tool-Liste, das Response-Shape), aber sie führt noch keinen echten
 * CopilotKit-Turn aus.
 *
 * Warum: das echte `createTurnRunner` aus `run-turn.ts` ist eng an den
 * Intelligence-Worker gekoppelt (Thread-Locks, persistente Threads,
 * Runner-WS-URLs). Eine 1:1-Integration in den MCP-Pfad ist eine eigene
 * Stufe, die Zeit braucht — und die andere Teile von Stufe 1
 * (MCP-Routes, Tool-Liste, DB-Schema, UI) blockiert, bis sie steht.
 *
 * Stufe 1.1+: echter Turn. Dann wird `runTurnForBot` durch den
 * bestehenden `createTurnRunner`-Pfad ersetzt und dieser Helper wird
 * zur dünnen Adapter-Funktion.
 */
import type { Database } from "../db/client";

export type RunTurnInput = {
  database: Database;
  agentId: string;
  prompt: string;
  ephemeral: boolean;
  timeoutMs?: number;
};

export type RunTurnResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Liest den Agent-Namen, damit die Stub-Antwort nicht generisch klingt.
 * Die echte Variante ruft stattdessen den Turn-Runner.
 */
async function readAgentName(database: Database, agentId: string): Promise<string> {
  try {
    const row = await database.execute(
      // pg parametrisiert — kein SQL-Injection-Risiko.
      { sql: "SELECT name FROM agents WHERE id = $1", args: [agentId] } as never,
    );
    const rows = (row as { rows?: Array<{ name?: string }> }).rows ?? [];
    return rows[0]?.name ?? "der Agent";
  } catch {
    return "der Agent";
  }
}

export async function runTurn(input: RunTurnInput): Promise<string> {
  // Stufe 1: Stub-Antwort, die ehrlich sagt, was passiert.
  // Das ist gut genug, um die MCP-Routes, das Tool-Listing und die
  // Frontend-UI komplett zu testen, ohne den CopilotKit-Turn-Pfad
  // anzufassen.
  const name = await readAgentName(input.database, input.agentId);
  return [
    `[MCP-Stub für "${name}"]`,
    `Stufe 1.1+: in der nächsten Stufe wird dieser Aufruf durch den echten`,
    `CopilotKit-Turn-Runner ersetzt. Bis dahin ist das hier ein ehrlicher`,
    `Stub, damit du sehen kannst, dass der Pfad steht:`,
    ``,
    `Agent-ID: ${input.agentId}`,
    `Prompt (${input.prompt.length} Zeichen):`,
    input.prompt.length > 200
      ? `${input.prompt.slice(0, 200)}…`
      : input.prompt,
  ].join("\n");
}
