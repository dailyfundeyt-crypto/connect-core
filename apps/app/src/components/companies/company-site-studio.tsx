import {
  IconWorld,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SiteMarkOverlay } from "@/components/companies/site-mark-overlay";
import { SiteTaskComposer } from "@/components/companies/site-task-composer";
import { SiteToolsFloat } from "@/components/companies/site-tools-float";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import { getCompany } from "@/lib/companies/store";
import {
  getCompanySiteUrl,
  normalizeSiteUrl,
  setCompanySiteUrl,
  subscribeCompanySite,
} from "@/lib/companies/company-site";
import {
  clearSiteMarks,
  getSiteMark,
  setSiteMarking,
  subscribeSiteMark,
} from "@/lib/companies/site-mark";
import { useIframeBrowserNav } from "@/lib/companies/iframe-browser-nav";
import {
  getLabPrefs,
  openLabUrlInChrome,
  subscribeLabPrefs,
} from "@/lib/ui/lab-prefs";

/**
 * Unternehmen — full-bleed company site.
 * Mark regions → pick agent (sidebar) → write task → Browser Use / MCP.
 * Back / forward: Alt←→ / ⌘[] (when focus outside iframe) + float buttons.
 */
export function CompanySiteStudio({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
  /** Ignored — chrome is always hidden. */
  hideChrome?: boolean;
}) {
  const [url, setUrl] = useState(() => getCompanySiteUrl(companyId));
  const [draft, setDraft] = useState(url);
  const [editing, setEditing] = useState(!url);
  const [frameKey, setFrameKey] = useState(0);
  const [keepLogin, setKeepLogin] = useState(() => getLabPrefs().keepLoggedIn);
  const [marking, setMarking] = useState(
    () => getSiteMark(companyId).marking,
  );
  const [marks, setMarks] = useState(() => getSiteMark(companyId).marks);
  const openedFor = useRef<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const agentsQuery = useQuery(agentListQueryOptions());
  const { goBack, goForward } = useIframeBrowserNav(
    iframeRef,
    Boolean(url) && !editing,
  );

  const company = getCompany(companyId);
  const companyAgents = (agentsQuery.data ?? []).filter(
    (a): a is AgentProfile =>
      Boolean(company?.agentIds.includes(a.id)),
  );

  useEffect(() => {
    const refresh = () => {
      const next = getCompanySiteUrl(companyId);
      setUrl(next);
      setDraft(next);
      setEditing(!next);
    };
    refresh();
    return subscribeCompanySite(refresh);
  }, [companyId]);

  useEffect(
    () => subscribeLabPrefs(() => setKeepLogin(getLabPrefs().keepLoggedIn)),
    [],
  );

  useEffect(() => {
    const refresh = () => {
      const s = getSiteMark(companyId);
      setMarking(s.marking);
      setMarks(s.marks);
    };
    refresh();
    return subscribeSiteMark(refresh);
  }, [companyId]);

  useEffect(() => {
    if (!url || editing || !keepLogin) return;
    if (openedFor.current === url) return;
    openedFor.current = url;
    void openLabUrlInChrome(normalizeSiteUrl(url));
  }, [url, editing, keepLogin]);

  const save = () => {
    const next = setCompanySiteUrl(companyId, draft);
    setUrl(next);
    setDraft(next);
    setEditing(!next);
    setFrameKey((n) => n + 1);
    openedFor.current = "";
  };

  if (editing || !url) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-white px-6 text-center text-neutral-900">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">
          <IconWorld className="size-6" stroke={1.5} />
        </span>
        <div className="max-w-md space-y-1">
          <h1 className="text-base font-semibold tracking-tight">
            {companyName}
          </h1>
          <p className="text-[13px] text-neutral-500">
            Firmen-URL setzen. Danach: Agent links wählen, Bereich markieren,
            Auftrag schreiben.
          </p>
        </div>
        <form
          className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            className="h-10 border-neutral-200 bg-white font-mono text-[13px] shadow-none"
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://meine-firma.de"
            value={draft}
          />
          <Button className="h-10 shrink-0" disabled={!draft.trim()} type="submit">
            Speichern
          </Button>
        </form>
        {url ? (
          <button
            className="text-[12px] text-neutral-400 hover:text-neutral-700"
            onClick={() => {
              setDraft(url);
              setEditing(false);
            }}
            type="button"
          >
            Abbrechen
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-neutral-900">
      {keepLogin ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[11px] text-sky-950">
          <span>
            Connect-Chrome ist der Browser (Profil + Extensions). Dieses Pane
            ist Markier-Vorschau — kein Surfen im Web-Tab.
          </span>
        </div>
      ) : null}
      <div className="relative min-h-0 w-full flex-1 bg-white">
        <iframe
          allow="clipboard-read; clipboard-write; fullscreen"
          className="absolute inset-0 size-full border-0 bg-white"
          key={`${frameKey}:${url}`}
          ref={iframeRef}
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          src={url}
          title={`${companyName} · Unternehmen`}
        />
        <SiteMarkOverlay
          companyId={companyId}
          marking={marking}
          marks={marks}
        />
      </div>

      <SiteToolsFloat
        agents={companyAgents}
        companyId={companyId}
        companyName={companyName}
        hasMarks={marks.length > 0}
        marking={marking}
        onBack={goBack}
        onClearMarks={() => clearSiteMarks(companyId)}
        onForward={goForward}
        onSaveUrl={(next) => {
          const saved = setCompanySiteUrl(companyId, next);
          setUrl(saved);
          setDraft(saved);
          setFrameKey((n) => n + 1);
          openedFor.current = "";
        }}
        onToggleMark={() => {
          if (marking) setSiteMarking(companyId, false);
          else setSiteMarking(companyId, true);
        }}
        siteUrl={url}
      />

      {/* Sidebar-selected agent still gets the bottom composer when Aufgabe float is closed */}
      <SiteTaskComposer
        agents={companyAgents}
        companyId={companyId}
        companyName={companyName}
        siteUrl={normalizeSiteUrl(url)}
      />
    </div>
  );
}
