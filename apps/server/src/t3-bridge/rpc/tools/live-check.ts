/**
 * Live-Prüfung des T3-WS-RPC gegen den echten Sidecar.
 *
 * Lane: A03 (Welle W1).
 *
 * Aufruf (aus dem Repo-Root):
 *
 * ```
 * $env:T3_BEARER_TOKEN = "<Bearer-Token des Sidecars>"
 * $env:CONNECT_FLAGS_T3 = "all"
 * bun apps/server/src/t3-bridge/rpc/tools/live-check.ts
 * ```
 *
 * Das Skript liest **nur**: Server-Config, Provider-Liste, Contract-Version.
 * Es startet nichts, stoppt nichts und schreibt nichts. Tokens kommen aus der
 * Umgebung (`T3_BEARER_TOKEN`), niemals aus dem Skript.
 */

import { getT3Flag, T3_SIDECAR_DEFAULTS } from "../../contracts";
import { T3RpcClient } from "../client";

const origin = process.env.T3_ORIGIN ?? `http://127.0.0.1:${T3_SIDECAR_DEFAULTS.port}`;
const bearerToken = process.env.T3_BEARER_TOKEN ?? null;

async function main(): Promise<void> {
  console.log(`T3-Origin: ${origin}`);
  console.log(`Feature-Flag connect.t3.bridge: ${getT3Flag("bridge")}`);

  const client = new T3RpcClient({
    origin,
    bearerToken,
    wsTicket: process.env.T3_WS_TICKET ?? null,
    log: (message, detail) => console.log(`[transport] ${message}`, detail ?? ""),
  });

  try {
    const config = await client.connect();
    if (!config) {
      console.log("Keine Verbindung — Feature-Flag ist aus.");
      return;
    }
    const contract = client.checkContract();
    console.log("Contract:", JSON.stringify(contract, null, 2));

    const providers = await client.listProviders();
    console.log(`Provider (${providers.length}):`);
    for (const provider of providers) {
      console.log(
        ` - ${provider.driver} (${provider.providerId ?? "unbekannt"}): ` +
          `installed=${provider.installed} auth=${String(provider.authenticated)} ` +
          `modelle=${provider.models.length}` +
          (provider.reason ? ` grund=${provider.reason}` : ""),
      );
    }
  } catch (error) {
    const detail =
      typeof error === "object" && error !== null
        ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        : String(error);
    console.error("Fehler:", detail);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

await main();

export {};
