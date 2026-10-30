/**
 * Proof that a file written on an Archil disk is still there for the next command.
 *
 * Two separate execs, because that is the only way to show it: each exec gets a brand-new container
 * with the disk mounted at its root, so anything the first command leaves in the container rather
 * than on the disk is gone before the second one starts. This writes a unique line in the first and
 * reads it back in the second, and exits non-zero unless the second output carries it.
 *
 * Needs ARCHIL_API_KEY (starts with `key-`, from https://console.archil.com/api-keys) in the root
 * .env, and uses the disk named by ARCHIL_DISK_ID — creating one only when that is unset. Run from
 * apps/server with `bun run archil:check`.
 */
import { randomUUID } from "node:crypto";
import { archilDisk, archilSettings, createArchilDisk, runOnArchilDisk } from "../src/archil-disk";

const settings = archilSettings();
if (!settings) {
  console.error(
    "ARCHIL_API_KEY is not set, so there is nothing to prove. Put an API key (starts with key-) from https://console.archil.com/api-keys into ARCHIL_API_KEY in the root .env.",
  );
  process.exit(1);
}

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
/*
 * A fresh subdirectory per run, not the disk root: exec mounts are shared, and a write straight into
 * a directory somebody else's mount holds is refused with "Read-only file system". The dynamic
 * ownership claim takes a directory this run made itself.
 */
const directory = `persistence-checks/${runId}`;
const file = `${directory}/written-once.txt`;
const marker = `archil-persistence-ok ${runId}`;

async function main(): Promise<void> {
  const configuredId = process.env.ARCHIL_DISK_ID?.trim();
  const disk = configuredId
    ? await archilDisk()
    : await createArchilDisk(`connect-persistence-check-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`);

  console.log(`Disk:     ${disk.name} (${disk.id})`);
  console.log(`Region:   ${disk.region}`);
  if (!configuredId) {
    console.log(`ARCHIL_DISK_ID is unset; this run made the disk above. Set ARCHIL_DISK_ID=${disk.id} to reuse it.`);
  }

  const written = await runOnArchilDisk(
    disk,
    `mkdir -p '${directory}' && printf '%s\n' '${marker}' > '${file}'`,
  );
  if (written.exitCode !== 0) {
    throw new Error(`The first exec could not write ${file} (exit ${written.exitCode}). stderr: ${written.stderr.trim()}`);
  }
  console.log(`Exec 1:   wrote ${file}`);

  const read = await runOnArchilDisk(disk, `cat '${file}'`);
  if (read.exitCode !== 0) {
    throw new Error(`The second exec could not read ${file} back (exit ${read.exitCode}). stderr: ${read.stderr.trim()}`);
  }
  if (!read.stdout.includes(marker)) {
    throw new Error(
      `The second exec did not return what the first one wrote. Expected to find ${JSON.stringify(marker)}, read ${JSON.stringify(read.stdout)}.`,
    );
  }

  console.log(`Exec 2:   read back ${JSON.stringify(read.stdout.trim())}`);
  console.log("OK: the file outlived the container that wrote it.");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Archil persistence check failed: ${message}`);
  // A 401 is the one failure worth naming: the usual cause is a disk/mount token where an API key
  // belongs, or a key made in a different region than ARCHIL_REGION names.
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(message)) {
    console.error(
      "A 401 means the credential is probably a disk/mount token (adt_…) rather than an API key, or the key belongs to another region than ARCHIL_REGION.",
    );
  }
  process.exit(1);
}
