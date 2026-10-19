let companyScope = "standalone";

export function setFluxCompanyScope(companyId: string) {
  companyScope = companyId;
}

export function isFluxEmbedded() {
  return companyScope !== "standalone";
}

export function readFluxLocal(key: string): string | null {
  try {
    const scoped = localStorage.getItem(scopedKey(key));
    if (scoped !== null) return scoped;
    // Migrate the existing standalone inventory once, without deleting the original copy.
    const legacy = localStorage.getItem(key);
    if (legacy !== null && companyScope !== "standalone") localStorage.setItem(scopedKey(key), legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function writeFluxLocal(key: string, value: string) {
  try {
    localStorage.setItem(scopedKey(key), value);
  } catch {
    // Keep the inventory usable if browser storage is full or unavailable.
  }
}

function scopedKey(key: string) {
  return companyScope === "standalone" ? key : `flux:${encodeURIComponent(companyScope)}:${key}`;
}
