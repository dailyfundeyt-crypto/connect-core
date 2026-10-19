import {
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { COMPANY_APP_OPEN_EVENT } from "@/company-apps/registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { getActiveLevel, setActiveLevel } from "@/lib/companies/level";
import {
  getCompany,
  listCompanies,
  subscribeCompanies,
} from "@/lib/companies/store";
import { appConfig } from "@/lib/generated/application-config";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

const ACTIVE_KEY = "connect.activeCompanyId";

/** Stored id, tolerant of older JSON-quoted values ("\"spark\""). */
function readStoredActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  } catch {
    return null;
  }
}

function readActiveId(companies: ConnectCompany[]): string | null {
  if (typeof window === "undefined") return companies[0]?.id ?? null;
  const stored = readStoredActiveId();
  if (stored && companies.some((c) => c.id === stored)) return stored;
  return companies[0]?.id ?? null;
}

function writeActiveId(id: string) {
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event("connect-active-company"));
}

/**
 * Brand mark in the rail (helium-companylogo): the brand mark always reflects the company the
 * user actually picked. There is no "Home" brand state any more — the Home menu entry that set
 * it was removed, and with no way to set the flag, the read path reduces to a stored active id.
 */
function readBrandCompanyId(companies: ConnectCompany[]): string | null {
  if (typeof window === "undefined") return null;
  const stored = readStoredActiveId();
  return stored && companies.some((c) => c.id === stored) ? stored : null;
}

const DEFAULT_ICON_ATTR = "data-connect-default-href";

/** Browser tab: "Connect · <Firma>" + company logo as favicon. */
function applyDocumentBrand(company: ConnectCompany | null) {
  if (typeof document === "undefined") return;
  const product = appConfig.brand.productName;
  // Title must keep starting with "Connect" (Start-Connect.ps1 / Notch find the window by it).
  document.title = company ? `${product} · ${company.name}` : product;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (!link.hasAttribute(DEFAULT_ICON_ATTR)) {
    link.setAttribute(DEFAULT_ICON_ATTR, link.getAttribute("href") ?? "");
  }
  const fallback = link.getAttribute(DEFAULT_ICON_ATTR) || CONNECT_BRAND_LOGO;
  const href = company?.logo || fallback;
  if (link.getAttribute("href") === href) return;
  if (company?.logo) link.removeAttribute("type");
  else link.setAttribute("type", "image/png");
  link.setAttribute("href", href);
}

/**
 * One source of truth for the company menu: the desktop rail (CompanySwitcher) and the mobile
 * profile sheet both read companies / active company / actions from here, so a switch in either
 * place updates the whole app at once (localStorage + "connect-active-company" event).
 */
export function useCompanySwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams({ strict: false }) as { companyId?: string };
  const [companies, setCompanies] = useState(listCompanies);
  const [activeId, setActiveId] = useState<string | null>(() =>
    readActiveId(listCompanies()),
  );
  // German unless the user explicitly picked another language (Stefan works in German).
  const { locale } = useLocale();
  const de = !locale || locale === "de";
  const [brandId, setBrandId] = useState<string | null>(() =>
    readBrandCompanyId(listCompanies()),
  );

  useEffect(() => {
    const sync = () => {
      const next = listCompanies();
      setCompanies(next);
      setActiveId(readActiveId(next));
      setBrandId(readBrandCompanyId(next));
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ACTIVE_KEY) {
        sync();
      }
    };
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", onStorage);
    const off = subscribeCompanies(sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", onStorage);
      off();
    };
  }, []);

  useEffect(() => {
    if (params.companyId && companies.some((c) => c.id === params.companyId)) {
      if (readStoredActiveId() !== params.companyId) writeActiveId(params.companyId);
      setActiveId(params.companyId);
    }
  }, [params.companyId, companies]);

  const active =
    (activeId ? getCompany(activeId) : undefined) ?? companies[0] ?? null;
  const brand = (brandId ? getCompany(brandId) : undefined) ?? null;

  /** Make `company` active everywhere; `navigateTo: false` keeps the current page (mobile). */
  const select = (company: ConnectCompany, opts?: { navigateTo?: boolean }) => {
    writeActiveId(company.id);
    setActiveId(company.id);
    if (opts?.navigateTo === false) return;
    const level = getActiveLevel();
    if (level === 2) {
      setActiveLevel(2);
      void navigate({ to: "/" });
      return;
    }
    void navigate({
      to: "/company/$companyId",
      params: { companyId: company.id },
      search: { level },
    });
  };

  const openProfile = () => {
    const id = active?.id;
    if (!id) return;
    // Firmenprofil = dailyfun (https://github.com/dailyfundeyt-crypto/dailyfun)
    // als rechtes Panel im Messages-Workspace. Wir bleiben auf der aktuellen
    // Route (oder gehen zur Messages-View), falls der User auf einer anderen
    // Connect-Seite war, und dispatchen das COMPANY_APP_OPEN_EVENT, damit die
    // Messages-View die dailyfun-App als Panel einblendet.
    if (location.pathname !== "/") {
      void navigate({ to: "/" });
    }
    window.dispatchEvent(
      new CustomEvent(COMPANY_APP_OPEN_EVENT, { detail: { appId: "dailyfun" } }),
    );
  };

  const newCompany = () => void navigate({ to: "/company/new" });
  const manageCompanies = () => void navigate({ to: "/settings", hash: "companies" });

  const labels = {
    title: de ? "Firmen" : "Companies",
    profile: de ? "Firmenprofil" : "Company profile",
    create: de ? "Neue Firma" : "New company",
    manage: de ? "Firmen verwalten" : "Manage companies",
    empty: de ? "Noch keine Firmen in diesem Konto." : "No companies in this account yet.",
    active: de ? "Aktiv" : "Active",
    pick: de ? "Firma wählen" : "Pick a company",
  };

  return {
    companies,
    active,
    activeId: active?.id ?? null,
    brand,
    select,
    openProfile,
    newCompany,
    manageCompanies,
    labels,
  };
}

/**
 * Company switcher — brand mark top left in the desktop sidebar rail.
 * Shows the picked company's logo (and, with `showLabel`, its name); click opens the
 * company menu (logo, name, subtitle per company + Firmenprofil / Neue Firma / Firmen verwalten).
 */
export function CompanySwitcher({ showLabel = false }: { showLabel?: boolean } = {}) {
  const sw = useCompanySwitcher();
  const { companies, active, brand, labels } = sw;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    applyDocumentBrand(brand);
  }, [brand?.id, brand?.name, brand?.logo]);

  const closeThen = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  const menu = (
    <DropdownMenuContent align="start" className="w-72 rounded-xl p-1.5">
      <DropdownMenuGroup>
        <DropdownMenuLabel>{labels.title}</DropdownMenuLabel>
        {companies.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{labels.empty}</p>
        ) : null}
        {companies.map((company) => (
          <DropdownMenuItem
            className={cn(
              "items-start gap-2.5 rounded-lg py-2",
              company.id === active?.id && "bg-accent/60",
            )}
            key={company.id}
            onClick={() => closeThen(() => sw.select(company))}
          >
            <CompanyMark company={company} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{company.name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {company.description}
              </p>
            </div>
            {company.id === active?.id ? (
              <IconCheck aria-label={labels.active} className="mt-1 size-4 shrink-0 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {active ? (
          <DropdownMenuItem onClick={() => closeThen(sw.openProfile)}>
            <IconBuilding className="size-4" />
            {labels.profile}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => closeThen(sw.newCompany)}>
          <IconPlus className="size-4" />
          {labels.create}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => closeThen(sw.manageCompanies)}>
          <IconSettings className="size-4" />
          {labels.manage}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label="Unternehmen wechseln"
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg outline-none transition-colors",
          showLabel
            ? "max-w-[9.5rem] px-1 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            : "w-8 justify-center",
          "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          open &&
            "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]",
        )}
        title={
          brand
            ? `${appConfig.brand.productName} · ${brand.name}`
            : appConfig.brand.productName
        }
      >
        <span
          className="flex size-[22px] shrink-0 items-center justify-center animate-in fade-in-0 zoom-in-75 duration-200 ease-out motion-reduce:animate-none"
          data-brand={brand?.id ?? "connect"}
          key={brand?.id ?? "connect"}
        >
          {brand ? (
            <CompanyMark company={brand} size={22} />
          ) : (
            <ConnectBrandMark size={22} />
          )}
        </span>
        {showLabel ? (
          <>
            <span className="min-w-0 truncate text-[13px] font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {brand?.name ?? labels.pick}
            </span>
            <IconChevronDown className="size-3.5 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
}

const CONNECT_BRAND_LOGO = "/brand/connect-logo.png";

function ConnectBrandMark({ size = 22 }: { size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-[10px] font-semibold text-white"
        style={{ width: size, height: size }}
      >
        C
      </div>
    );
  }
  return (
    <img
      alt={appConfig.brand.productName}
      className="shrink-0 rounded-lg object-cover"
      height={size}
      onError={() => setBroken(true)}
      src={CONNECT_BRAND_LOGO}
      style={{ width: size, height: size }}
      width={size}
    />
  );
}

export function CompanyMark({
  company,
  size = 36,
}: {
  company: ConnectCompany | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  // A newly uploaded logo gets a fresh chance to load.
  useEffect(() => setBroken(false), [company?.logo]);
  const initials = (company?.name ?? "C")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  if (company?.logo && !broken) {
    return (
      <img
        alt=""
        className="shrink-0 rounded-lg object-cover"
        height={size}
        onError={() => setBroken(true)}
        src={company.logo}
        style={{ width: size, height: size }}
        width={size}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        size < 28 ? "text-[9px]" : "text-xs",
      )}
      style={{
        width: size,
        height: size,
        background: company?.accent ?? "#334155",
      }}
    >
      {initials}
    </div>
  );
}
