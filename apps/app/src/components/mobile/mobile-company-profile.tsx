import { IconAppWindow, IconArrowLeft, IconExternalLink, IconLink } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CompanyStockTile } from "@/components/companies/company-stock-tile";
import { CompanySocialProfile } from "@/components/social/company-social-profile";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { getCompanySiteUrl, subscribeCompanySite } from "@/lib/companies/company-site";
import { subscribeLevel3Browser } from "@/lib/companies/level3-tools";
import { listProjects, subscribeProjects } from "@/lib/companies/projects";
import { companyDefaultLink } from "@/lib/mobile/app-links";
import { type AppBrowserTarget, MobileAppBrowser, openAppLink } from "./mobile-app-browser";
import "./mobile.css";

/**
 * Firmenprofil auf dem Handy (helium-inappbrowser, 17.10.2026): dunkel wie der Rest der
 * Handy-Ansicht statt des hellen Desktop-Profils. Logo quadratisch, Website, Zahlen mit
 * Beschriftung, Kurs-Karte im Fluss, Projektliste (kein Apps-Bereich mehr; Start = Standard-App).
 */
export function MobileCompanyProfile({ company }: { company: ConnectCompany }) {
  const navigate = useNavigate();
  // Startansicht = Standard-App der Firma (wie am PC im Unternehmen-Modus), Profil bleibt dahinter.
  const [target, setTarget] = useState<AppBrowserTarget | null>(() => {
    const d = companyDefaultLink(company.id);
    return d ? { url: d.url, title: `${company.name} · ${d.label}` } : null;
  });
  const [fromDefault, setFromDefault] = useState(() => Boolean(companyDefaultLink(company.id)));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const a = subscribeLevel3Browser(bump);
    const b = subscribeCompanySite(bump);
    const c = subscribeProjects(bump);
    return () => {
      a();
      b();
      c();
    };
  }, []);
  const site = useMemo(() => {
    void tick;
    return getCompanySiteUrl(company.id) || company.website || "";
  }, [company, tick]);
  const projects = useMemo(() => {
    void tick;
    return listProjects(company.id);
  }, [company.id, tick]);
  const defaultLink = useMemo(() => {
    void tick;
    return companyDefaultLink(company.id);
  }, [company.id, tick]);
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/" });
  };
  const handle = company.handle ? `@${company.handle.replace(/^@/, "")}` : `@${company.id}`;
  const siteUrl = site && !/^https?:\/\//i.test(site) ? `https://${site}` : site;

  return (
    <div className="connect-mobile-home min-h-svh text-white antialiased" data-testid="mobile-company-profile">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-[#07080c]/80 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <button
          aria-label="Zurück"
          className="flex size-10 items-center justify-center rounded-full text-white/85 active:bg-white/10"
          onClick={goBack}
          type="button"
        >
          <IconArrowLeft className="size-[22px]" stroke={1.8} />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-white/70">Unternehmensprofil</p>
        {defaultLink ? (
          <button
            className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-black active:opacity-80"
            data-testid="open-default-app"
            onClick={() => {
              setFromDefault(true);
              openAppLink({ url: defaultLink.url, title: `${company.name} · ${defaultLink.label}` }, setTarget);
            }}
            type="button"
          >
            <IconAppWindow className="size-4" stroke={2} />
            Standard-App
          </button>
        ) : null}
      </header>

      <CompanySocialProfile company={company} fallback={<>
      <div className="px-5 pt-2">
        <div className="flex items-center gap-4">
          {company.logo ? (
            <img
              alt=""
              className="size-[76px] shrink-0 rounded-[28%] object-cover ring-1 ring-white/10"
              src={company.logo}
            />
          ) : (
            <span className="size-[76px] shrink-0 rounded-[28%] ring-1 ring-white/10" style={{ background: company.accent || "#334155" }} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-semibold tracking-tight">{company.name}</h1>
            <p className="truncate text-[14px] text-white/45">{handle}</p>
          </div>
        </div>
        {company.description?.trim() ? (
          <p className="mt-3 text-[15px] leading-relaxed text-white/70">{company.description.trim()}</p>
        ) : null}
        {siteUrl ? (
          <button
            className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[14px] text-sky-300 active:opacity-70"
            onClick={() => {
              setFromDefault(false);
              openAppLink({ url: siteUrl, title: "Website" }, setTarget);
            }}
            type="button"
          >
            <IconLink className="size-4 shrink-0" />
            <span className="truncate">{siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          </button>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { label: "Agents", value: company.agentIds?.length ?? 0 },
            { label: "Projekte", value: projects.length },
          ].map((s) => (
            <div className="connect-mobile-glass rounded-2xl px-3 py-2.5" key={s.label}>
              <p className="text-[20px] font-semibold leading-none tabular-nums">{s.value}</p>
              <p className="mt-1 text-[12px] text-white/45">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="dark relative mt-3 overflow-hidden rounded-2xl [&_*]:max-w-full">
          <CompanyStockTile companyId={company.id} companyName={company.name} />
        </div>
      </div>

      {/* Stefan 12:33: kein Apps-Bereich im Profil (Links bleiben gespeichert, Standard-App startet weiter). */}
      <div className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+3rem)] z-[5] mt-4 border-b border-white/[0.08] bg-[#07080c]/85 px-5 backdrop-blur">
        <p className="h-11 text-[15px] font-medium leading-[2.75rem] text-white">Projekte{projects.length ? ` ${projects.length}` : ""}</p>
      </div>

        <ul className="pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2">
          {projects.length === 0 ? (
            <li className="px-6 py-8 text-center text-[15px] text-white/45">Noch keine Projekte.</li>
          ) : (
            projects.map((p) => (
              <li key={p.id}>
                <button
                  className="flex w-full items-center gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
                  onClick={() => void navigate({ to: "/company/$companyId", params: { companyId: company.id }, search: { project: p.id } as never })}
                  type="button"
                >
                  {p.logo ? (
                    <img alt="" className="size-11 rounded-[30%] object-cover ring-1 ring-white/10" src={p.logo} />
                  ) : (
                    <span className="size-11 rounded-[30%] ring-1 ring-white/10" style={{ background: p.accent || "#334155" }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{p.name}</span>
                    <span className="block truncate text-[13px] text-white/45">
                      {p.description?.trim() || `${p.agentIds.length} Agents`}
                    </span>
                  </span>
                  <IconExternalLink className="size-4 shrink-0 text-white/0" />
                </button>
              </li>
            ))
          )}
        </ul>

      </>} />

      <MobileAppBrowser
        onClose={() => {
          setTarget(null);
          // Zurück aus der Standard-App verlässt die Firma ganz (Profil bleibt über den Firmen-Knopf erreichbar).
          if (fromDefault) goBack();
        }}
        onShowCompany={
          fromDefault
            ? () => {
                setFromDefault(false);
                setTarget(null);
              }
            : undefined
        }
        target={target}
      />
    </div>
  );
}
