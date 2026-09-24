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

export {
  formatCompanyHandle,
  handleFromName,
  isValidHandle,
  normalizeHandle,
} from "./handles";

const STORAGE_KEY = "connect.companies.custom";

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

/** Seed + user companies. */
export function listCompanies(): ConnectCompany[] {
  const custom = readCustom();
  const customIds = new Set(custom.map((c) => c.id));
  return [
    ...custom,
    ...CONNECT_COMPANIES.filter((c) => !customIds.has(c.id)),
  ];
}

export function getCompany(id: string): ConnectCompany | undefined {
  return readCustom().find((c) => c.id === id) ?? getSeedCompany(id);
}

export function isCustomCompany(id: string): boolean {
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

export function createCompany(input: NewCompanyInput): ConnectCompany {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const description = input.description.trim();
  if (!description) throw new Error("Description is required.");

  let id = slugify(name);
  const existing = new Set(listCompanies().map((c) => c.id));
  if (existing.has(id)) {
    id = `${id}-${Date.now().toString(36)}`;
  }

  const company: ConnectCompany = {
    id,
    name,
    description,
    handle: claimUniqueHandle(handleFromName(name)),
    agentIds: input.agentIds?.length
      ? input.agentIds
      : ["cto", "analysis", "connect", "consensus", "flux", "hyper", "spark"],
    accent: ACCENTS[readCustom().length % ACCENTS.length],
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.banner ? { banner: input.banner } : {}),
  };

  writeCustom([company, ...readCustom()]);
  return company;
}

export function updateCompanyLogo(id: string, logo: string) {
  updateCompany(id, { logo });
}

/** Edit name, description, handle, logo, banner, or meta — seed + custom. */
export function updateCompany(
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
): ConnectCompany {
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
  if (patch.logo === null) delete next.logo;
  else if (typeof patch.logo === "string") next.logo = patch.logo;
  if (patch.banner === null) delete next.banner;
  else if (typeof patch.banner === "string") next.banner = patch.banner;
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
export function addAgentToCompany(
  companyId: string,
  agentId: string,
): ConnectCompany {
  const company = getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  if (company.agentIds.includes(agentId)) return company;
  return updateCompany(companyId, {
    agentIds: [...company.agentIds, agentId],
  });
}

export function deleteCompany(id: string) {
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
