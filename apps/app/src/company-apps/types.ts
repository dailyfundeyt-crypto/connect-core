import type { ComponentType } from "react";
import type { ConnectCompany } from "@/lib/companies/catalog";

export type CompanyAppManifest = {
  /** Stable, URL-safe module ID. Used to isolate this module's browser storage. */
  id: string;
  /** Human-readable name shown in the Messages app picker. */
  name?: string;
  description?: string;
  /** A custom company can be matched by its stable ID or public handle. */
  companyIds?: string[];
  companyHandles?: string[];
  /**
   * Opt-in visual theme for the company-app wrapper. "light" leaves the wrapper
   * transparent so the embedded app paints its own background (e.g. Dailyfun).
   * "dark" (default) keeps the legacy black canvas used by Analysis, Flux, etc.
   */
  theme?: "dark" | "light";
};

export type CompanyAppStorage = {
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
  subscribe(listener: () => void): () => void;
};

export type CompanyAppProps = {
  company: ConnectCompany;
  storage: CompanyAppStorage;
  identity: { id: string; email: string; name: string | null; image: string | null } | null;
};

export type LoadedCompanyApp = {
  manifest: CompanyAppManifest;
  Component: ComponentType<CompanyAppProps>;
};
