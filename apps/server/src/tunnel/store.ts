/** Gekoppelte Handys + Tunnel-Status als JSON-Dateien (portabel, keine DB-Migration noetig). */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PairedDevice = {
  id: string;
  label: string;
  userId: string;
  secretHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  userAgent: string;
  /** Better-Auth-Sitzung, die dieses Geraet traegt (wird beim Entfernen mit geloescht). */
  sessionToken: string | null;
};

export type TunnelState = {
  mode: string;
  status: "off" | "starting" | "online" | "offline" | "error" | "missing-binary";
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  lastReadyAt: string | null;
  error: string | null;
  restarts: number;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function writeJsonAtomic(path: string, value: unknown) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, path);
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function createTunnelStore(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const devicesPath = join(dataDir, "devices.json");
  const statePath = join(dataDir, "state.json");
  let devices: PairedDevice[] = readJson<PairedDevice[]>(devicesPath, []);
  let lastSeenFlush = 0;

  const saveDevices = () => writeJsonAtomic(devicesPath, devices);

  return {
    devices: () => devices.slice(),
    addDevice(input: { label: string; userId: string; userAgent: string }) {
      const id = `dev_${randomBytes(9).toString("base64url")}`;
      const secret = randomBytes(32).toString("base64url");
      const device: PairedDevice = {
        id,
        label: input.label.slice(0, 80),
        userId: input.userId,
        secretHash: sha256(secret),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        userAgent: input.userAgent.slice(0, 300),
        sessionToken: null,
      };
      devices.push(device);
      saveDevices();
      return { device, cookieValue: `${id}.${secret}` };
    },
    verify(cookieValue: string | null | undefined): PairedDevice | null {
      if (!cookieValue) return null;
      const dot = cookieValue.indexOf(".");
      if (dot <= 0) return null;
      const id = cookieValue.slice(0, dot);
      const secret = cookieValue.slice(dot + 1);
      const device = devices.find((candidate) => candidate.id === id);
      if (!device) return null;
      const a = Buffer.from(sha256(secret), "hex");
      const b = Buffer.from(device.secretHash, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      return device;
    },
    touch(device: PairedDevice) {
      device.lastSeenAt = new Date().toISOString();
      if (Date.now() - lastSeenFlush > 60_000) {
        lastSeenFlush = Date.now();
        saveDevices();
      }
    },
    setSession(device: PairedDevice, token: string | null) {
      device.sessionToken = token;
      saveDevices();
    },
    remove(id: string): PairedDevice | null {
      const found = devices.find((candidate) => candidate.id === id) ?? null;
      if (!found) return null;
      devices = devices.filter((candidate) => candidate.id !== id);
      saveDevices();
      return found;
    },
    readState: () => readJson<TunnelState | null>(statePath, null),
    writeState: (state: TunnelState) => writeJsonAtomic(statePath, state),
    path: dataDir,
  };
}

export type TunnelStore = ReturnType<typeof createTunnelStore>;
