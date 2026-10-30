/**
 * Cua-Maschinen-Backend — Modul-Fassade.
 *
 * Lane: A19
 * Eigentümer: A19 (Cua-Maschinen-Backend)
 */

import type { Database } from "../db/client";
import { CuaCliRunner, FakeCuaCliRunner, EMPTY_PNG } from "./cli";
import { checkWindowsPreflight, resolveCuaBinaryPath } from "./preflight";
import { CuaComputerProvider } from "./provider";
import { createMachineRoutes } from "./routes/machines";
import { runCuaProvisioningSeed, type SeedResult } from "./seed";
import { CuaMachineService } from "./service";
import { DrizzleMachineStore, MemoryMachineStore } from "./store";
import type {
  AgentMachineAssignment,
  CuaDoctorResult,
  CuaSandboxInfo,
  ICuaCli,
  IMachineStore,
  Machine,
  MachineCreateInput,
  MachineKind,
  MachineListResponse,
  MachineMode,
  MachineModeResponse,
  MachineStatus,
} from "./types";

export {
  CuaCliRunner,
  FakeCuaCliRunner,
  EMPTY_PNG,
  checkWindowsPreflight,
  resolveCuaBinaryPath,
  CuaComputerProvider,
  createMachineRoutes,
  runCuaProvisioningSeed,
  CuaMachineService,
  DrizzleMachineStore,
  MemoryMachineStore,
};

export type {
  AgentMachineAssignment,
  CuaDoctorResult,
  CuaSandboxInfo,
  ICuaCli,
  IMachineStore,
  Machine,
  MachineCreateInput,
  MachineKind,
  MachineListResponse,
  MachineMode,
  MachineModeResponse,
  MachineStatus,
  SeedResult,
};

let globalCuaService: CuaMachineService | null = null;

/**
 * Erstellt eine neue Instanz des CuaMachineService mit optionalem DB-Client oder Fake-CLI.
 */
export function createCuaService(options?: {
  db?: Database;
  store?: IMachineStore;
  cli?: ICuaCli;
}): CuaMachineService {
  const store = options?.store ?? (options?.db ? new DrizzleMachineStore(options.db) : new MemoryMachineStore());
  const cli = options?.cli ?? new CuaCliRunner();
  return new CuaMachineService(store, cli);
}

/**
 * Liefert den globalen CuaMachineService-Singleton.
 */
export function getGlobalCuaService(): CuaMachineService | null {
  return globalCuaService;
}

/**
 * Registriert den globalen CuaMachineService-Singleton.
 */
export function setGlobalCuaService(service: CuaMachineService): void {
  globalCuaService = service;
}
