/**
 * User-created companies live in localStorage so Connect works fully offline.
 * Seed companies from the catalog stay available alongside them.
 */

import {
  CONNECT_COMPANIES,
  type ConnectCompany,
  getCompany as getSeedCompany,
} from "./catalog";
import {
  formatCompanyHandle,
  handleFromName,
  isValidHandle,
  normalizeHandle,
} from "./handles";
import { persistConnectDataUrl } from "./workspace-sync";

export {
  formatCompanyHandle,
  handleFromName,
  isValidHandle,
  normalizeHandle,
} from "./handles";

const STORAGE_KEY = "connect.companies.custom";

/** Tracks seed-company ids that the user has deleted so they stay gone across reloads. */
const DELETED_SEED_KEY = "connect.companies.deleted";

/**
 * One-time migration (idempotent, v0.0.4):
 * Seed companies (Nordwind, Lumen, Helm, Pulse) were removed from CONNECT_COMPANIES.
 * This migration:
 *   1. Marks them as permanently deleted so they stay gone across reloads even if
 *      the user never consciously deleted them before.
 *   2. Sets CLEANUP_KEY so the block runs exactly once.
 *
 * The old migration key "connect.companies.removed-default" is intentionally NOT
 * consulted — its purpose (make seeds deletable) is superseded by removing the
 * seeds entirely.
 */
function runClearDefaultCompaniesMigration(): void {
  if (typeof window === "undefined") return;
  try {
    const CLEANUP_KEY = "helium:v2-cleared-default-companies";
    if (window.localStorage.getItem(CLEANUP_KEY) === "1") return;

    // If the old migration ran, it may have cleared DELETED_SEED_KEY.
    // Restore it with the four seed ids so they stay gone.
    const SEED_IDS = ["nordwind", "lumen", "helm", "pulse"] as const;
    const deletedSeeds = readDeletedSeedIds();
    for (const id of SEED_IDS) deletedSeeds.add(id);
    window.localStorage.setItem(
      DELETED_SEED_KEY,
      JSON.stringify([...deletedSeeds]),
    );

    // Wipe the four ids from connect.companies.custom if they snuck in there
    // (older versions kept the seeds in user-storage before the catalog was
    // emptied). Without this, listCompanies() would still return them and
    // they could be "deleted" but instantly come back from custom storage.
    const STORAGE_KEY = "connect.companies.custom";
    const customRaw = window.localStorage.getItem(STORAGE_KEY);
    if (customRaw) {
      try {
        const parsed = JSON.parse(customRaw) as unknown;
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(
            (c): c is unknown =>
              !c ||
              typeof c !== "object" ||
              typeof (c as { id?: unknown }).id !== "string" ||
              !(SEED_IDS as readonly string[]).includes(
                (c as { id: string }).id,
              ),
          );
          if (filtered.length !== parsed.length) {
            if (filtered.length === 0) {
              window.localStorage.removeItem(STORAGE_KEY);
            } else {
              window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(filtered),
              );
            }
          }
        }
      } catch {
        /* corrupt JSON — leave it for the user to fix manually */
      }
    }

    // If the active company pointed at one of the four, drop the pointer so
    // the UI does not open a workspace that no longer exists.
    const active = window.localStorage.getItem("connect.activeCompanyId");
    if (active && (SEED_IDS as readonly string[]).includes(active)) {
      window.localStorage.removeItem("connect.activeCompanyId");
    }

    // Also clear the old migration key so it does not re-trigger and confuse future versions.
    window.localStorage.removeItem("connect.companies.removed-default");

    window.localStorage.setItem(CLEANUP_KEY, "1");
  } catch {
    /* ignore — non-fatal */
  }
}

function readDeletedSeedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_SEED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s) => typeof s === "string"));
  } catch {
    return new Set();
  }
}

/** Externalise image fields to the server so localStorage does not blow its quota. */
async function externaliseCompanyImages<T extends { logo?: string; banner?: string }>(
  value: T,
): Promise<T> {
  const next: T = { ...value };
  if (typeof next.logo === "string" && next.logo.startsWith("data:")) {
    try {
      next.logo = await persistConnectDataUrl(next.logo);
    } catch {
      /* keep data url — surface to caller */
    }
  }
  if (typeof next.banner === "string" && next.banner.startsWith("data:")) {
    try {
      next.banner = await persistConnectDataUrl(next.banner);
    } catch {
      /* keep data url — surface to caller */
    }
  }
  return next;
}

function readCustom(): ConnectCompany[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCompany);
  } catch {
    return [];
  }
}

function writeCustom(list: ConnectCompany[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unknown storage error";
    throw new Error(
      `Konnte Unternehmen nicht speichern (Browser-Speicher voll: ${message}). ` +
        `Bilder werden zuerst auf den Server geladen – versuche es erneut.`,
    );
  }
  window.dispatchEvent(new Event("connect-companies-changed"));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

function isCompany(value: unknown): value is ConnectCompany {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.description === "string" &&
    Array.isArray(c.agentIds) &&
    typeof c.accent === "string"
  );
}

/** Resolve the public @handle (falls back to id for older records). */
export function companyHandle(company: ConnectCompany): string {
  const raw = company.handle?.trim() || company.id;
  return normalizeHandle(raw) || company.id;
}

/** True if no other company already claims this handle. */
export function isHandleAvailable(
  handle: string,
  exceptCompanyId?: string,
): boolean {
  const n = normalizeHandle(handle);
  if (!isValidHandle(n)) return false;
  return !listCompanies().some(
    (c) => c.id !== exceptCompanyId && companyHandle(c) === n,
  );
}

function claimUniqueHandle(preferred: string, exceptId?: string): string {
  let base = normalizeHandle(preferred);
  if (!isValidHandle(base)) base = handleFromName(preferred);
  if (isHandleAvailable(base, exceptId)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, 26)}${i}`;
    if (isHandleAvailable(candidate, exceptId)) return candidate;
  }
  return `${base.slice(0, 20)}${Date.now().toString(36).slice(-4)}`;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || `company-${Date.now().toString(36)}`;
}

const ACCENTS = [
  "linear-gradient(145deg, #0f766e 0%, #164e63 55%, #1e293b 100%)",
  "linear-gradient(145deg, #7c3aed 0%, #db2777 50%, #1e293b 100%)",
  "linear-gradient(145deg, #ca8a04 0%, #ea580c 45%, #1e293b 100%)",
  "linear-gradient(145deg, #0369a1 0%, #4f46e5 55%, #1e293b 100%)",
  "linear-gradient(145deg, #15803d 0%, #0f766e 50%, #1e293b 100%)",
];

/** Seed + user companies, minus any seeds the user has deleted. */
export function listCompanies(): ConnectCompany[] {
  runClearDefaultCompaniesMigration();
  const custom = readCustom();
  const customIds = new Set(custom.map((c) => c.id));
  const deletedSeeds = readDeletedSeedIds();
  return [
    ...custom,
    ...CONNECT_COMPANIES.filter(
      (c) => !customIds.has(c.id) && !deletedSeeds.has(c.id),
    ),
  ];
}

export function getCompany(id: string): ConnectCompany | undefined {
  const deletedSeeds = readDeletedSeedIds();
  if (!deletedSeeds.has(id)) {
    const seed = getSeedCompany(id);
    if (seed) return seed;
  }
  return readCustom().find((c) => c.id === id);
}

export function isCustomCompany(id: string): boolean {
  // A company is "custom" (user-created) if it is stored in localStorage.
  // Deleted seeds are NOT custom companies.
  return readCustom().some((c) => c.id === id);
}

export type NewCompanyInput = {
  name: string;
  description: string;
  /** data URL or /path for the square profile logo */
  logo?: string;
  /** data URL or /path for the wide header banner behind the logo */
  banner?: string;
  /** Which Connect bots belong in this company; defaults to all six. */
  agentIds?: string[];
};

export async function createCompany(
  input: NewCompanyInput,
): Promise<ConnectCompany> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const description = input.description.trim();
  if (!description) throw new Error("Description is required.");

  let id = slugify(name);
  const existing = new Set(listCompanies().map((c) => c.id));
  if (existing.has(id)) {
    id = `${id}-${Date.now().toString(36)}`;
  }

  // Externalise logo/banner to the server FIRST so the localStorage write
  // never hits its quota. The data: URL stays in the input only if the upload
  // fails — that is surfaced back to the caller via the thrown error below.
  const persistedImages = await externaliseCompanyImages({
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.banner ? { banner: input.banner } : {}),
  });

  const company: ConnectCompany = {
    id,
    name,
    description,
    handle: claimUniqueHandle(handleFromName(name)),
    agentIds: input.agentIds?.length
      ? input.agentIds
      : ["cto", "analysis", "connect", "consensus", "flux", "hyper", "spark"],
    accent: ACCENTS[readCustom().length % ACCENTS.length],
    ...(persistedImages.logo ? { logo: persistedImages.logo } : {}),
    ...(persistedImages.banner ? { banner: persistedImages.banner } : {}),
  };

  writeCustom([company, ...readCustom()]);
  return company;
}

export function updateCompanyLogo(id: string, logo: string) {
  updateCompany(id, { logo });
}

/** Edit name, description, handle, logo, banner, or meta — seed + custom. */
export async function updateCompany(
  id: string,
  patch: {
    name?: string;
    description?: string;
    handle?: string | null;
    logo?: string | null;
    banner?: string | null;
    category?: string | null;
    location?: string | null;
    website?: string | null;
    agentIds?: string[];
  },
): Promise<ConnectCompany> {
  const existing = getCompany(id);
  if (!existing) throw new Error("Company not found.");

  const next: ConnectCompany = {
    ...existing,
    ...(patch.name !== undefined
      ? { name: patch.name.trim() || existing.name }
      : {}),
    ...(patch.description !== undefined
      ? {
          description:
            patch.description.trim() || existing.description,
        }
      : {}),
  };
  if (patch.handle !== undefined) {
    if (patch.handle === null || patch.handle.trim() === "") {
      delete next.handle;
    } else {
      const n = normalizeHandle(patch.handle);
      if (!isValidHandle(n)) {
        throw new Error("Handle: 2–30 Zeichen, a–z, 0–9, . und _");
      }
      if (!isHandleAvailable(n, id)) {
        throw new Error(`@co/${n} ist schon vergeben.`);
      }
      next.handle = n;
    }
  }
  // Externalise new data: URLs to the server BEFORE the localStorage write so
  // editing a banner can never throw a quota error mid-save.
  if (typeof patch.logo === "string" && patch.logo.startsWith("data:")) {
    try {
      next.logo = await persistConnectDataUrl(patch.logo);
    } catch {
      next.logo = patch.logo;
    }
  } else if (patch.logo === null) {
    delete next.logo;
  } else if (typeof patch.logo === "string") {
    next.logo = patch.logo;
  }
  if (typeof patch.banner === "string" && patch.banner.startsWith("data:")) {
    try {
      next.banner = await persistConnectDataUrl(patch.banner);
    } catch {
      next.banner = patch.banner;
    }
  } else if (patch.banner === null) {
    delete next.banner;
  } else if (typeof patch.banner === "string") {
    next.banner = patch.banner;
  }
  if (patch.category === null) delete next.category;
  else if (typeof patch.category === "string") {
    next.category = patch.category.trim() || undefined;
  }
  if (patch.location === null) delete next.location;
  else if (typeof patch.location === "string") {
    next.location = patch.location.trim() || undefined;
  }
  if (patch.website === null) delete next.website;
  else if (typeof patch.website === "string") {
    next.website = patch.website.trim() || undefined;
  }
  if (patch.agentIds) {
    next.agentIds = [...new Set(patch.agentIds.filter(Boolean))];
  }

  const list = readCustom().filter((c) => c.id !== id);
  writeCustom([next, ...list]);
  return next;
}

/** Attach a bot to a company roster (e.g. after Plus → New bot in Connect). */
export async function addAgentToCompany(
  companyId: string,
  agentId: string,
): Promise<ConnectCompany> {
  const company = getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  if (company.agentIds.includes(agentId)) return company;
  return updateCompany(companyId, {
    agentIds: [...company.agentIds, agentId],
  });
}

export function deleteCompany(id: string) {
  if (typeof window === "undefined") return;

  const wasSeed = !isCustomCompany(id);
  const deletedSeeds = readDeletedSeedIds();

  // Detach any localStorage that points at the doomed company so the UI does
  // not get stuck on a missing id. Do this BEFORE the write so listeners see
  // the new active id in the same tick.
  try {
    if (window.localStorage.getItem("connect.activeCompanyId") === id) {
      let fallback: string;
      if (wasSeed) {
        // Fall back to the first non-deleted seed company, or a custom one.
        fallback =
          CONNECT_COMPANIES.find(
            (c) => c.id !== id && !deletedSeeds.has(c.id),
          )?.id ??
          readCustom().find((c) => c.id !== id)?.id ??
          "";
      } else {
        fallback =
          readCustom().find((c) => c.id !== id)?.id ??
          CONNECT_COMPANIES.find(
            (c) => c.id !== id && !deletedSeeds.has(c.id),
          )?.id ??
          "";
      }
      window.localStorage.setItem("connect.activeCompanyId", fallback);
      window.dispatchEvent(new Event("connect-active-company"));
    }
  } catch {
    /* ignore */
  }

  if (wasSeed) {
    // Mark the seed id as deleted so it stays absent across page reloads.
    deletedSeeds.add(id);
    window.localStorage.setItem(
      DELETED_SEED_KEY,
      JSON.stringify([...deletedSeeds]),
    );
  }

  // Remove the company from custom storage if it happens to be there
  // (seed companies are never stored, but defensive).
  writeCustom(readCustom().filter((c) => c.id !== id));
}

export function subscribeCompanies(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener("connect-companies-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-companies-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/** Read active company id from localStorage. Exported so other modules (e.g. marketplace redeem) can use it. */
export function readActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("connect.activeCompanyId");
}

/**
 * Add a redeemed bot to the currently active company so it appears immediately
 * in the sidebar "Agents" list without requiring a manual add.
 *
 * If no company is active, falls back to the first available company.
 * Idempotent — skips if the agent is already in the roster.
 */
export async function addAgentToActiveCompany(agentId: string): Promise<void> {
  let companyId = readActiveCompanyId();
  if (!companyId) {
    const companies = listCompanies();
    companyId = companies[0]?.id ?? null;
  }
  if (!companyId) return;
  try {
    await addAgentToCompany(companyId, agentId);
  } catch (err) {
    // Non-fatal: the agent is redeemed but adding to the roster failed.
    // The user can still access it via "Meine Bots" in the Marketplace.
    console.warn("[redeem] could not add agent to company:", err);
  }
}
