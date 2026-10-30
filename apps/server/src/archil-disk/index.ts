/**
 * Archil disks: files that outlive the run that wrote them.
 *
 * A disk is a filesystem in Archil's account, not in this container: a file written from one exec
 * is there for the next one, and for a run on a different machine tomorrow. What does not survive is
 * the container — every exec starts fresh, so only what went to the disk is kept.
 *
 * Three settings, all from the environment and all server-side. ARCHIL_API_KEY is an API key and
 * starts with `key-`; a disk or mount token (`adt_…`, ARCHIL_MOUNT_TOKEN / ARCHIL_DISK_TOKEN) is a
 * different credential and the API answers it with 401. Keys are region-scoped, so a key made in
 * `aws-us-east-1` is refused in `aws-us-west-2` and ARCHIL_REGION has to name the key's own region.
 *
 * Never import this from browser code. The key is not behind a NEXT_PUBLIC_/VITE_ prefix and must
 * not be: this module belongs to the API process only.
 */
import { Archil, type Disk } from "disk";

export type ArchilSettings = { apiKey: string; region: string };

/** Where a key made without a stated region lives, and the only default worth having. */
export const ARCHIL_DEFAULT_REGION = "aws-us-east-1";

/** The two values every call needs, or undefined when this deployment has no Archil key. */
export function archilSettings(env: NodeJS.ProcessEnv = process.env): ArchilSettings | undefined {
  const apiKey = env.ARCHIL_API_KEY?.trim();
  if (!apiKey) return undefined;
  return { apiKey, region: env.ARCHIL_REGION?.trim() || ARCHIL_DEFAULT_REGION };
}

/**
 * A client for this environment's key.
 *
 * A per-instance `Archil` rather than the module-level `configure`: the module-level client is one
 * global, so a process that ever holds two keys — a workspace tests one, a request uses another —
 * silently gives both to whichever ran last.
 */
export function archilClient(env: NodeJS.ProcessEnv = process.env): Archil {
  const settings = archilSettings(env);
  if (!settings) {
    throw new Error(
      "ARCHIL_API_KEY is not set, so no Archil disk is reachable. Put an API key (starts with key-) from https://console.archil.com/api-keys into ARCHIL_API_KEY.",
    );
  }
  return new Archil(settings);
}

function diskIdFromEnv(env: NodeJS.ProcessEnv): string {
  const id = env.ARCHIL_DISK_ID?.trim();
  if (!id) {
    throw new Error(
      "ARCHIL_DISK_ID is not set, so there is no disk to use. Create one with `bun run archil:check` (it prints the id) or name an existing disk from https://console.archil.com.",
    );
  }
  return id;
}

/** The disk named by ARCHIL_DISK_ID. Fetched per call: a disk outlives this process. */
export async function archilDisk(env: NodeJS.ProcessEnv = process.env): Promise<Disk> {
  return archilClient(env).disks.get(diskIdFromEnv(env));
}

/**
 * A new disk, and its id.
 *
 * The mount token `create` also returns is dropped on purpose: it is shown once, it is only for
 * mounting the disk on a machine, and neither exec nor the object API needs it. Printing it into a
 * terminal or a log is how it ends up somewhere it should not be.
 */
export async function createArchilDisk(name: string, env: NodeJS.ProcessEnv = process.env): Promise<Disk> {
  const created = await archilClient(env).disks.create({ name });
  return created.disk;
}

export type DiskExecOutput = { stdout: string; stderr: string; exitCode: number };

/**
 * One command, in a container with the disk mounted read-write at its root.
 *
 * The disk is also the working directory, so relative paths are relative to it. The container is
 * new every time and is gone afterwards: a file survives because it is on the disk, not because the
 * command before this one left something behind. Commands are capped at five minutes.
 */
export async function runOnArchilDisk(disk: Disk, command: string): Promise<DiskExecOutput> {
  const result = await disk.exec(command);
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}

/** Writes a text file to the disk by object key, e.g. `reports/2026-10/summary.md`. */
export async function writeArchilFile(disk: Disk, key: string, content: string): Promise<void> {
  await disk.putObject(key, content, "text/plain; charset=utf-8");
}

/** Reads a text file back. Throws when the key does not exist, rather than returning "". */
export async function readArchilFile(disk: Disk, key: string): Promise<string> {
  return new TextDecoder().decode(await disk.getObject(key));
}
