import { IconPlus, IconSettings, IconBuilding } from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

const ACTIVE_KEY = "connect.activeCompanyId";

function readActiveId(companies: ConnectCompany[]): string | null {
  if (typeof window === "undefined") return companies[0]?.id ?? null;
  const stored = window.localStorage.getItem(ACTIVE_KEY);
  if (stored && companies.some((c) => c.id === stored)) return stored;
  return companies[0]?.id ?? null;
}

function writeActiveId(id: string) {
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event("connect-active-company"));
}

/*
 * Brand mark in the rail (helium-companylogo): shows the company the user
 * actually picked. "Home" (or no stored pick) shows the Connect logo again.
 * The Home flag is a UI-only key, so it never changes which company the rest
 * of the app works in.
 */
const BRAND_HOME_KEY = "connect.companySwitcher.home";
const BRAND_EVENT = "connect-company-brand";

function readBrandCompanyId(companies: ConnectCompany[]): string | null {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(BRAND_HOME_KEY) === "1") return null;
  const stored = window.localStorage.getItem(ACTIVE_KEY);
  return stored && companies.some((c) => c.id === stored) ? stored : null;
}

function setBrandHome(home: boolean) {
  if (typeof window === "undefined") return;
  const current = window.localStorage.getItem(BRAND_HOME_KEY) === "1";
  if (current === home) return;
  if (home) window.localStorage.setItem(BRAND_HOME_KEY, "1");
  else window.localStorage.removeItem(BRAND_HOME_KEY);
  window.dispatchEvent(new Event(BRAND_EVENT));
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
 * Company switcher — brand mark in the mode icon rail.
 * Shows the picked company's logo (Connect logo on Home / no pick);
 * open the menu to pick a company.
 */
export function CompanySwitcher() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { companyId?: string };
  const [companies, setCompanies] = useState(listCompanies);
  const [activeId, setActiveId] = useState<string | null>(() =>
    readActiveId(listCompanies()),
  );
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(() =>
    readBrandCompanyId(listCompanies()),
  );

  useEffect(() => {
    const sync = () => setBrandId(readBrandCompanyId(listCompanies()));
    sync();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === ACTIVE_KEY ||
        event.key === BRAND_HOME_KEY
      ) {
        sync();
      }
    };
    window.addEventListener(BRAND_EVENT, sync);
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", onStorage);
    const off = subscribeCompanies(sync);
    return () => {
      window.removeEventListener(BRAND_EVENT, sync);
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", onStorage);
      off();
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const next = listCompanies();
      setCompanies(next);
      setActiveId(readActiveId(next));
    };
    refresh();
    return subscribeCompanies(refresh);
  }, []);

  useEffect(() => {
    if (params.companyId && companies.some((c) => c.id === params.companyId)) {
      setBrandHome(false);
      writeActiveId(params.companyId);
      setActiveId(params.companyId);
    }
  }, [params.companyId, companies]);

  useEffect(() => {
    const onActive = () => setActiveId(readActiveId(listCompanies()));
    window.addEventListener("connect-active-company", onActive);
    return () => window.removeEventListener("connect-active-company", onActive);
  }, []);

  const active =
    (activeId ? getCompany(activeId) : undefined) ?? companies[0] ?? null;
  const brand = (brandId ? getCompany(brandId) : undefined) ?? null;

  useEffect(() => {
    applyDocumentBrand(brand);
  }, [brand?.id, brand?.name, brand?.logo]);

  const closeThen = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  const select = (company: ConnectCompany) => {
    setBrandHome(false);
    writeActiveId(company.id);
    setActiveId(company.id);
    const level = getActiveLevel();
    closeThen(() => {
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
    });
  };

  const openProfile = () => {
    const id = active?.id;
    if (!id) return;
    closeThen(() => {
      void navigate({
        to: "/company/$companyId",
        params: { companyId: id },
        search: { level: 2, profile: true },
      });
    });
  };

  const menu = (
    <DropdownMenuContent align="start" className="w-72 rounded-xl p-1.5">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Companies</DropdownMenuLabel>
        {companies.map((company) => (
          <DropdownMenuItem
            className="items-start gap-2.5 rounded-lg py-2"
            key={company.id}
            onClick={() => select(company)}
          >
            <CompanyMark company={company} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{company.name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {company.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {active ? (
          <DropdownMenuItem onClick={openProfile}>
            <IconBuilding className="size-4" />
            Company profile
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() =>
            closeThen(() => {
              void navigate({ to: "/company/new" });
            })
          }
        >
          <IconPlus className="size-4" />
          New company
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            closeThen(() => {
              void navigate({ to: "/settings", hash: "companies" });
            })
          }
        >
          <IconSettings className="size-4" />
          Manage companies
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setBrandHome(true);
            closeThen(() => {
              void navigate({ to: "/" });
            });
          }}
        >
          Home
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label="Unternehmen wechseln"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg outline-none transition-colors",
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

function CompanyMark({
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
