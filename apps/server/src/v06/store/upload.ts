/**
 * Connect Store Upload Service (v06)
 * Speichert Pakete lokal unter %APPDATA%\Connect\store\packages und setzt Status auf 'review'.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { StoreListing, StoreListingStatus } from "../../contracts/v06/store";
import {
  type ConnectPackageManifest,
  type StoreVersion,
} from "./manifest";
import {
  validateManifest,
  validatePackageFileTree,
  isPathTraversal,
  isForbiddenBinary,
  type PackageFileEntry,
} from "./packageValidator";
import { saveStoreListing, getStoreListingById } from "./listings";

/**
 * Ermittelt das lokale Paket-Verzeichnis (%APPDATA%\Connect\store\packages).
 */
export function getStorePackagesDir(): string {
  if (process.env.CONNECT_STORE_DIR) {
    return process.env.CONNECT_STORE_DIR;
  }

  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) {
    return path.join(appData, "Connect", "store", "packages");
  }

  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    return path.join(home, ".connect", "store", "packages");
  }

  return path.join(process.cwd(), "temp-store-packages");
}

export function ensureStorePackagesDir(): string {
  const dir = getStorePackagesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Parst ZIP-Einträge ohne externe Abhängigkeiten über Central Directory und Local File Header.
 */
export function parseZipFileEntries(buffer: Buffer): PackageFileEntry[] {
  const entries: PackageFileEntry[] = [];
  const seenPaths = new Set<string>();

  // 1. Suche nach Central Directory Record Signatur (0x02014b50)
  let offset = 0;
  while (offset + 46 <= buffer.length) {
    const idx = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset);
    if (idx === -1) break;

    try {
      const fileNameLen = buffer.readUInt16LE(idx + 28);
      const extraLen = buffer.readUInt16LE(idx + 30);
      const commentLen = buffer.readUInt16LE(idx + 32);
      const uncompressedSize = buffer.readUInt32LE(idx + 24);

      if (idx + 46 + fileNameLen <= buffer.length) {
        const name = buffer.toString("utf8", idx + 46, idx + 46 + fileNameLen);
        if (!seenPaths.has(name)) {
          seenPaths.add(name);
          entries.push({ path: name, size: uncompressedSize });
        }
      }
      offset = idx + 46 + fileNameLen + extraLen + commentLen;
    } catch {
      break;
    }
  }

  // 2. Fallback: Local File Headers (0x04034b50) falls Central Directory nicht gefunden wurde
  if (entries.length === 0) {
    offset = 0;
    while (offset + 30 <= buffer.length) {
      const idx = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset);
      if (idx === -1) break;

      try {
        const fileNameLen = buffer.readUInt16LE(idx + 26);
        const extraLen = buffer.readUInt16LE(idx + 28);
        const uncompressedSize = buffer.readUInt32LE(idx + 22);

        if (idx + 30 + fileNameLen <= buffer.length) {
          const name = buffer.toString("utf8", idx + 30, idx + 30 + fileNameLen);
          if (!seenPaths.has(name)) {
            seenPaths.add(name);
            entries.push({ path: name, size: uncompressedSize });
          }
        }
        offset = idx + 30 + fileNameLen + extraLen;
      } catch {
        break;
      }
    }
  }

  return entries;
}

export interface UploadPackageOptions {
  manifestRaw?: unknown;
  archiveBuffer?: Buffer;
  authorId?: string;
  dbOverride?: any;
}

export interface UploadPackageResult {
  ok: boolean;
  listing?: StoreListing;
  version?: StoreVersion;
  packagePath?: string;
  packageHash?: string;
  errors?: string[];
}

/**
 * Speichert ein Paket lokal und registriert es im Status 'review'.
 */
export async function uploadPackage(options: UploadPackageOptions): Promise<UploadPackageResult> {
  const errors: string[] = [];

  // 1. Wenn Archivpuffer vorhanden ist: Dateibaum und Sicherheitsregeln prüfen
  if (options.archiveBuffer && options.archiveBuffer.length > 0) {
    const fileEntries = parseZipFileEntries(options.archiveBuffer);
    if (fileEntries.length > 0) {
      const treeCheck = validatePackageFileTree(fileEntries);
      if (!treeCheck.valid) {
        return { ok: false, errors: treeCheck.errors };
      }
    }
  }

  // 2. Manifest validieren
  const manifestValidation = validateManifest(options.manifestRaw);
  if (!manifestValidation.valid || !manifestValidation.data) {
    return { ok: false, errors: manifestValidation.errors };
  }

  const manifest = manifestValidation.data;

  // 3. Sicherheitsprüfungen auf Manifestpfade
  if (manifest.entry && isPathTraversal(manifest.entry)) {
    return { ok: false, errors: ["Entry path contains forbidden path traversal sequences."] };
  }
  if (manifest.entry && isForbiddenBinary(manifest.entry)) {
    return { ok: false, errors: ["Entry path references forbidden executable binary."] };
  }

  // 4. Verzeichnis im Paket-Speicher anlegen (%APPDATA%\Connect\store\packages\<slug>\<version>)
  const baseDir = ensureStorePackagesDir();
  const packageDir = path.join(baseDir, manifest.slug, manifest.version);
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true });
  }

  // 5. Manifest und Archiv speichern
  const manifestPath = path.join(packageDir, "connect-package.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  let packageHash = "";
  let archivePath = "";
  if (options.archiveBuffer) {
    archivePath = path.join(packageDir, "package.zip");
    fs.writeFileSync(archivePath, options.archiveBuffer);
    packageHash = crypto.createHash("sha256").update(options.archiveBuffer).digest("hex");
  } else {
    packageHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");
  }

  // 6. Listing erstellen oder aktualisieren (Status 'review' für neu eingereichte Pakete)
  const existing = await getStoreListingById(manifest.slug, options.dbOverride);
  const listingId = existing ? existing.id : `listing-${manifest.slug}`;
  const authorId = options.authorId || (typeof manifest.author === "string" ? manifest.author : manifest.author?.name || "anonymous");

  const listing: StoreListing = {
    id: listingId,
    kind: manifest.kind,
    slug: manifest.slug,
    name: manifest.name,
    version: manifest.version,
    authorId,
    iconUrl: manifest.icon || (existing ? existing.iconUrl : ""),
    screenshots: manifest.screenshots || (existing ? existing.screenshots : []),
    summary: manifest.summary,
    description: manifest.description,
    installSpec: manifest.installSpec,
    priceCents: 0,
    status: "review" as StoreListingStatus, // Strikte Anforderung: Nach Upload immer 'review'
  };

  await saveStoreListing(listing, options.dbOverride);

  // 7. Versionsobjekt
  const storeVersion: StoreVersion = {
    id: `ver-${manifest.slug}-${manifest.version}`,
    listingId: listing.id,
    version: manifest.version,
    packageHash,
    packagePath: archivePath || manifestPath,
    manifest,
    status: "review",
    createdAt: new Date().toISOString(),
  };

  return {
    ok: true,
    listing,
    version: storeVersion,
    packagePath: archivePath || manifestPath,
    packageHash,
  };
}
