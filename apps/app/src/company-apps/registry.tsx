import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { cn } from "@/lib/utils";
import { createCompanyAppStorage } from "./storage";
import type {
  CompanyAppManifest,
  CompanyAppProps,
  LoadedCompanyApp,
} from "./types";
export type { LoadedCompanyApp, CompanyAppManifest, CompanyAppProps };
import type { AuthenticatedUser } from "@/lib/auth/queries";

type ManifestModule = { manifest: CompanyAppManifest };
type AppModule = { default: ComponentType<CompanyAppProps> };

// Add a module folder with manifest.ts and app.tsx. Vite includes it automatically.
const manifests = import.meta.glob<ManifestModule>("./modules/*/manifest.ts", {
  eager: true,
});
const appLoaders = import.meta.glob<AppModule>("./modules/*/app.tsx");

const loadedApps: LoadedCompanyApp[] = Object.entries(manifests).flatMap(
  ([manifestPath, module]) => {
    const appPath = manifestPath.replace(/manifest\.ts$/, "app.tsx");
    const loader = appLoaders[appPath];
    if (!loader || !/^[a-z0-9-]+$/.test(module.manifest.id)) return [];
    return [{ manifest: module.manifest, Component: lazy(loader) }];
  },
);

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/^@/, "") ?? "";
}

export function getCompanyApp(company: ConnectCompany): LoadedCompanyApp | null {
  const id = normalize(company.id);
  const handle = normalize(company.handle ?? company.id);
  return (
    loadedApps.find(({ manifest }) =>
      (manifest.companyIds ?? []).some((candidate) => normalize(candidate) === id) ||
      (manifest.companyHandles ?? []).some((candidate) => normalize(candidate) === handle),
    ) ?? null
  );
}

/** Every app compiled into Connect, for the Messages workspace picker. */
export function listCompanyApps(): LoadedCompanyApp[] {
  return loadedApps;
}

export const COMPANY_APP_OPEN_EVENT = "connect:open-company-app";
export const COMPANY_APP_CLOSE_EVENT = "connect:close-company-app";
export const COMPANY_APP_SELECTION_KEY = "connect.messages.companyApp";

export function readSelectedCompanyAppId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(COMPANY_APP_SELECTION_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedCompanyAppId(appId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (appId) {
      window.localStorage.setItem(COMPANY_APP_SELECTION_KEY, appId);
    } else {
      window.localStorage.removeItem(COMPANY_APP_SELECTION_KEY);
    }
  } catch {
    // ignore
  }
}

export function openCompanyApp(appId: string) {
  writeSelectedCompanyAppId(appId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(COMPANY_APP_OPEN_EVENT, { detail: { appId } }),
    );
  }
}

export function closeCompanyApp() {
  writeSelectedCompanyAppId(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COMPANY_APP_CLOSE_EVENT));
  }
}

export function getCompanyAppById(appId: string | null | undefined): LoadedCompanyApp | null {
  if (!appId) return null;
  const id = normalize(appId);
  return (
    loadedApps.find(
      ({ manifest }) =>
        normalize(manifest.id) === id ||
        (manifest.id === "connect-sozial" && id === "dailyfun") ||
        (manifest.id === "flux" && (id === "tool-flux" || id === "company-flux")) ||
        (manifest.id === "analysis" && id === "tool-analysis"),
    ) ?? null
  );
}

export function useActiveCompanyApp(): {
  activeAppId: string | null;
  activeApp: LoadedCompanyApp | null;
  openApp: (appId: string) => void;
  closeApp: () => void;
} {
  const [appId, setAppId] = useState<string | null>(() => readSelectedCompanyAppId());

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ appId?: string }>;
      const nextId = custom.detail?.appId ?? readSelectedCompanyAppId();
      if (nextId) setAppId(nextId);
    };
    const handleClose = () => {
      setAppId(null);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === COMPANY_APP_SELECTION_KEY) {
        setAppId(readSelectedCompanyAppId());
      }
    };

    window.addEventListener(COMPANY_APP_OPEN_EVENT, handleOpen);
    window.addEventListener(COMPANY_APP_CLOSE_EVENT, handleClose);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(COMPANY_APP_OPEN_EVENT, handleOpen);
      window.removeEventListener(COMPANY_APP_CLOSE_EVENT, handleClose);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const activeApp = useMemo(() => getCompanyAppById(appId), [appId]);

  return {
    activeAppId: activeApp ? activeApp.manifest.id : null,
    activeApp,
    openApp: openCompanyApp,
    closeApp: closeCompanyApp,
  };
}

export function CompanyAppWorkspace({
  app,
  company,
  identity,
}: {
  app: LoadedCompanyApp;
  company: ConnectCompany;
  identity: AuthenticatedUser | null;
}) {
  const Component = app.Component;
  const appName = app.manifest.name ?? app.manifest.id;
  const isLight = app.manifest.theme === "light";
  return (
    <div
      data-connect-company-app="true"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isLight
          ? "bg-background text-foreground"
          : "bg-[#08090d] text-white",
      )}
    >
      <CompanyAppErrorBoundary appName={appName}>
        <Suspense fallback={<CompanyAppLoading name={appName} />}>
          <Component
            company={company}
            storage={createCompanyAppStorage(app.manifest.id, company.id)}
            identity={identity ? { id: identity.id, email: identity.email, name: identity.name ?? null, image: identity.image ?? null } : null}
          />
        </Suspense>
      </CompanyAppErrorBoundary>
    </div>
  );
}

function CompanyAppLoading({ name }: { name: string }) {
  return (
    <div
      aria-label={`${name} wird geladen`}
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center bg-[#08090d] px-6"
      role="status"
    >
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <span className="relative flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            <span className="size-3 animate-pulse rounded-full bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.45)]" />
          </span>
          <div>
            <p className="text-sm font-medium text-white/85">{name} wird gestartet</p>
            <p className="mt-1 text-xs text-white/40">Arbeitsbereich wird vorbereitet …</p>
          </div>
        </div>
        <div className="space-y-3" aria-hidden="true">
          <div className="h-20 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]" />
            <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]" />
            <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]" />
          </div>
        </div>
      </div>
    </div>
  );
}

class CompanyAppErrorBoundary extends Component<
  { appName: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#08090d] px-6 text-center" role="alert">
          <div className="max-w-sm">
            <p className="text-sm font-medium text-white/85">{this.props.appName} konnte nicht geladen werden</p>
            <p className="mt-2 text-xs leading-relaxed text-white/45">Bitte lade Connect neu. Wenn das Problem bleibt, fehlen möglicherweise aktuelle App-Dateien.</p>
            <button
              className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/75 transition hover:bg-white/10"
              onClick={() => window.location.reload()}
              type="button"
            >
              Connect neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
