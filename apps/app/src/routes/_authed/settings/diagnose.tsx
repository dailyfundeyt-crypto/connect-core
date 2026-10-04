/**
 * Admin-Diagnose-Toolbox.
 *
 * Was sie ist:
 *   - Eine EIGENE Seite, NEBEN /settings, NICHT ein Ersatz dafür.
 *   - Sie sammelt Werkzeuge, mit denen man die 3-Stunden-Änderungen
 *     sicher testen kann, ohne die Hauptapp zu berühren.
 *   - Jede Sektion hat: "Was wurde gemacht" + "Try" (was tut es gerade) +
 *     "Fallback" (was passiert wenn es crasht) + "Raw state".
 *
 * Mounted unter `/_authed/settings/diagnose`.
 *
 * Wichtig: Diese Seite ändert keine Hauptseite. Sie ist read-only by default
 * (außer expliziten "Apply"-Buttons). Wenn etwas hier crasht, crasht nur
 * diese Seite — die Hauptapp unter /settings bleibt unangetastet.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconCircleX,
  IconRefresh,
  IconTool,
  IconExternalLink,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listCompanies, subscribeCompanies } from "@/lib/companies/store";

export const Route = createFileRoute("/_authed/settings/diagnose")({
  component: RouteComponent,
});

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

type SectionStatus = "idle" | "running" | "ok" | "warn" | "error";

type Section = {
  id: string;
  title: string;
  short: string;
  status: SectionStatus;
  message: string;
  details?: unknown;
};

type Snapshot = {
  apiMe: { status: number; body: unknown } | null;
  apiCapabilities: { status: number; body: unknown } | null;
  companies: { id: string; name: string; isSeed: boolean }[];
  userAgent: string;
  origin: string;
  href: string;
  localStorageKeys: { key: string; size: number; sample: string }[];
  shortcuts: Record<string, unknown> | null;
  profile: unknown;
};

// ───────────────────────────────────────────────────────────────────────────
// Probe helpers — alles read-only, kein Schreib-State
// ───────────────────────────────────────────────────────────────────────────

async function probe<T>(path: string): Promise<{ status: number; body: T }> {
  try {
    const res = await fetch(path, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    return { status: res.status, body: body as T };
  } catch (e) {
    return { status: 0, body: { error: String(e) } };
  }
}

function readLocalStorageSnapshot(): {
  keys: { key: string; size: number; sample: string }[];
  shortcuts: Record<string, unknown> | null;
  profile: unknown;
} {
  const keys: { key: string; size: number; sample: string }[] = [];
  let shortcuts: Record<string, unknown> | null = null;
  let profile: unknown = null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const value = window.localStorage.getItem(key) ?? "";
      keys.push({ key, size: value.length, sample: value.slice(0, 80) });
      if (key === "connect.shortcuts") {
        try {
          shortcuts = JSON.parse(value);
        } catch {
          shortcuts = null;
        }
      }
      if (key === "connect.profile" || key === "connect.local-profile") {
        try {
          profile = JSON.parse(value);
        } catch {
          profile = null;
        }
      }
    }
  } catch (e) {
    keys.push({ key: "(read-error)", size: 0, sample: String(e) });
  }
  return { keys, shortcuts, profile };
}

const SEED_IDS = ["nordwind", "lumen", "helm", "pulse"] as const;

function readCompaniesSnapshot() {
  return listCompanies().map((c) => ({
    id: c.id,
    name: c.name,
    isSeed: (SEED_IDS as readonly string[]).includes(c.id),
  }));
}

async function takeSnapshot(): Promise<Snapshot> {
  const [me, caps] = await Promise.all([
    probe<unknown>("/api/me"),
    probe<unknown>("/api/capabilities"),
  ]);
  const local = readLocalStorageSnapshot();
  return {
    apiMe: me,
    apiCapabilities: caps,
    companies: readCompaniesSnapshot(),
    userAgent: navigator.userAgent,
    origin: window.location.origin,
    href: window.location.href,
    localStorageKeys: local.keys.sort((a, b) => b.size - a.size).slice(0, 30),
    shortcuts: local.shortcuts,
    profile: local.profile,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────

function RouteComponent() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [sections, setSections] = useState<Section[]>(() => defaultSections());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snap = await takeSnapshot();
      setSnapshot(snap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeCompanies(() => {
      setSnapshot((s) => (s ? { ...s, companies: readCompaniesSnapshot() } : s));
    });
    const id = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [refresh]);

  const setSection = useCallback(
    (id: string, patch: Partial<Section>) => {
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  const runSection = useCallback(
    async (id: string) => {
      const section = sections.find((s) => s.id === id);
      if (!section || !snapshot) return;
      setSection(id, { status: "running", message: "Läuft …" });
      try {
        const result = await runProbe(id, snapshot);
        setSection(id, result);
      } catch (e) {
        setSection(id, {
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [sections, snapshot, setSection],
  );

  const runAll = useCallback(async () => {
    if (!snapshot) return;
    for (const s of sections) {
      await runSection(s.id);
    }
  }, [sections, snapshot, runSection]);

  if (!snapshot) {
    return (
      <div className="min-h-svh bg-[#0e0e10] p-6 text-white">
        <p className="text-sm text-white/55">
          {error ? `Fehler: ${error}` : "Lade Snapshot …"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-[#0e0e10] px-5 py-6 text-white antialiased">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6">
        {/* Back */}
        <div className="flex items-center gap-2">
          <Button
            render={(props) => (
              <Link {...props} to="/settings">
                <IconArrowLeft className="mr-1 size-4" />
                Zurück zu Einstellungen
              </Link>
            )}
            size="sm"
            type="button"
            variant="ghost"
            className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
          />
        </div>

        {/* Header */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <IconTool className="size-5 text-emerald-300" />
            <h1 className="text-xl font-semibold">Admin-Diagnose</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              side-tool
            </span>
          </div>
          <p className="text-sm text-white/55">
            Werkzeugkasten für die 3-Stunden-Änderungen. Diese Seite berührt
            <strong> nicht </strong>
            die Hauptapp — wenn hier etwas crasht, läuft <code>/settings</code>{" "}
            weiter. Jede Sektion hat „Run" zum gefahrlosen Testen und einen
            Fallback-Plan, falls die Antwort rot wird.
          </p>
          <div className="flex gap-2">
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={() => void refresh()}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconRefresh className="mr-1.5 size-3.5" />
              Snapshot neu laden
            </Button>
            <Button
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              onClick={() => void runAll()}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconTool className="mr-1.5 size-3.5" />
              Alle Sektionen prüfen
            </Button>
          </div>
        </header>

        {/* Sections grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sections.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              onRun={() => void runSection(s.id)}
            />
          ))}
        </div>

        {/* Auth workbench — the heart of the diagnosis */}
        <AuthWorkbench snap={snapshot} onRefresh={() => void refresh()} />

        {/* Quick links */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Andere Diagnose-Werkzeuge
          </h2>
          <div className="grid grid-cols-1 gap-2 text-[13px] md:grid-cols-2">
            <ToolLink
              to="/settings/diagnose-companies"
              title="Diagnose: Companies"
              desc="Die bestehende Page für die 4 Seed-Unternehmen (Nordwind/Lumen/Helm/Pulse)."
            />
            <ToolLink
              to="/settings"
              title="Einstellungen (Hauptapp)"
              desc="Die normale Settings-Seite — wenn sie crasht, ist das der eigentliche Bug."
            />
            <ToolLink
              to="/sign"
              title="Anmeldung"
              desc="Wenn du dich neu anmelden willst (Google-OAuth oder Single-User)."
            />
            <ToolLink
              to="/"
              title="Connect-Startseite"
              desc="Die normale App — leer, wenn Auth nicht durch ist."
            />
          </div>
        </section>

        {/* Raw state */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Roh-Snapshot (read-only)
          </h2>
          <div className="grid grid-cols-1 gap-3 text-[12px] md:grid-cols-2">
            <KV
              label="window.location.href"
              value={snapshot.href}
              ok
            />
            <KV
              label="Origin"
              value={snapshot.origin}
              ok
            />
            <KV
              label="User-Agent"
              value={snapshot.userAgent.slice(0, 70) + (snapshot.userAgent.length > 70 ? "…" : "")}
              ok
            />
            <KV
              label="/api/me"
              value={
                snapshot.apiMe
                  ? `${snapshot.apiMe.status} ${summarizeBody(snapshot.apiMe.body)}`
                  : "—"
              }
              ok={snapshot.apiMe?.status === 200}
            />
            <KV
              label="/api/capabilities"
              value={
                snapshot.apiCapabilities
                  ? `${snapshot.apiCapabilities.status}`
                  : "—"
              }
              ok={snapshot.apiCapabilities?.status === 200}
            />
            <KV
              label="Companies (sichtbar)"
              value={String(snapshot.companies.length)}
              ok
            />
            <KV
              label="localStorage-Keys"
              value={String(snapshot.localStorageKeys.length) + " (Top 30 nach Größe)"}
              ok
            />
            <KV
              label="connect.shortcuts"
              value={snapshot.shortcuts ? "(geparst)" : "(nicht gesetzt)"}
              ok={!!snapshot.shortcuts}
            />
          </div>

          {snapshot.localStorageKeys.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] text-white/65">
                localStorage-Inhalt anzeigen ({snapshot.localStorageKeys.length} Keys)
              </summary>
              <ul className="mt-2 space-y-1">
                {snapshot.localStorageKeys.map((k) => (
                  <li
                    className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-1 text-[11px]"
                    key={k.key}
                  >
                    <code className="text-white/75">{k.key}</code>
                    <span className="text-white/40">{k.size} B</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <p className="text-center text-[11px] text-white/30">
          Diese Seite ist read-only. Schreibt nur, wenn du auf einen{" "}
          <em>Apply</em>-Button klickst. Snapshot wird alle 8 s aktualisiert.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Section card
// ───────────────────────────────────────────────────────────────────────────

function SectionCard({
  section,
  onRun,
}: {
  section: Section;
  onRun: () => void;
}) {
  const tone = toneFor(section.status);
  return (
    <article
      className={cn(
        "rounded-2xl border p-4",
        tone.bg,
        tone.border,
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{section.title}</h2>
          <p className="text-[12px] text-white/55">{section.short}</p>
        </div>
        <StatusPill status={section.status} />
      </header>
      <p className="mb-3 text-[12px] text-white/65">
        <span className="text-white/40">Aktuell: </span>
        {section.message}
      </p>
      {section.details !== undefined && section.details !== null && (
        <pre className="mb-3 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-white/70">
          {summarizeBody(section.details)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button
          className="border-white/10 bg-white/5 text-white hover:bg-white/10"
          onClick={onRun}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconRefresh className="mr-1.5 size-3.5" />
          Run
        </Button>
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SectionStatus }) {
  const map: Record<SectionStatus, { label: string; class: string; Icon: typeof IconCircleCheck }> = {
    idle: {
      label: "idle",
      class: "bg-white/10 text-white/55",
      Icon: IconCircleX,
    },
    running: {
      label: "läuft",
      class: "bg-blue-500/20 text-blue-200",
      Icon: IconRefresh,
    },
    ok: {
      label: "OK",
      class: "bg-emerald-500/20 text-emerald-200",
      Icon: IconCircleCheck,
    },
    warn: {
      label: "Vorsicht",
      class: "bg-amber-500/20 text-amber-200",
      Icon: IconAlertTriangle,
    },
    error: {
      label: "Fehler",
      class: "bg-red-500/20 text-red-200",
      Icon: IconAlertTriangle,
    },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        m.class,
      )}
    >
      <m.Icon className="size-3" />
      {m.label}
    </span>
  );
}

function toneFor(s: SectionStatus) {
  switch (s) {
    case "ok":
      return { bg: "bg-emerald-500/[0.04]", border: "border-emerald-500/20" };
    case "warn":
      return { bg: "bg-amber-500/[0.04]", border: "border-amber-500/25" };
    case "error":
      return { bg: "bg-red-500/[0.05]", border: "border-red-500/30" };
    case "running":
      return { bg: "bg-blue-500/[0.04]", border: "border-blue-500/20" };
    default:
      return { bg: "bg-white/[0.03]", border: "border-white/10" };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// AuthWorkbench — was zwischen Login und App passiert
//
// Warum sie existiert:
//   - Du sagst "Login funktioniert auf localhost, App aber nicht".
//   - Das heißt: Connect.exe hat den Server mit OAuth-Env gestartet (sonst
//     würde /api/capabilities kein "google" als Provider melden).
//   - Login-Flow geht durch, App bekommt aber trotzdem 401.
//   - Dann ist der Bug entweder:
//       a) Cookie wird nicht an die App gesendet (Scope/Path/SameSite).
//       b) Better-Auth-Session-Token ist da, App prüft ihn anders als das
//          Auth-Endpoint selbst.
//       d) CORS trennt da der Origin-Header zwischen 3101 und z.B. einem
//          dev-domain-override.
//
// Diese Komponente zeigt dir JEDES dieser Dinge gleichzeitig:
//   1. Was der Browser als Cookie für diese Origin hat.
//   2. Was /api/auth/get-session antwortet (Better-Auth offizielles Endpoint).
//   3. Was /api/me antwortet (App-Standard-Check).
//   4. Was /api/capabilities antwortet (Server-Config).
//   5. Welche Origins in den letzten Requests waren (Navigator + Header).
// ───────────────────────────────────────────────────────────────────────────

type AuthResult = {
  name: string;
  ok: boolean;
  detail: string;
  raw?: unknown;
};

function AuthWorkbench({
  snap,
  onRefresh,
}: {
  snap: Snapshot | null;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cookieReport, setCookieReport] = useState<{
    sameOrigin: string;
    cookies: Array<{ name: string; value: string; raw: string }>;
  } | null>(null);
  const [authSession, setAuthSession] = useState<{ status: number; body: unknown } | null>(null);
  const [meResult, setMeResult] = useState<{ status: number; body: unknown } | null>(null);
  const [capabilitiesResult, setCapabilitiesResult] = useState<
    { status: number; body: unknown } | null
  >(null);

  const runAll = useCallback(async () => {
    setBusy(true);
    try {
      // 1. Cookies für gleiche Origin (document.cookie ist Same-Origin only)
      const sameOriginCookies = document.cookie
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((raw) => {
          const eq = raw.indexOf("=");
          const name = eq === -1 ? raw : raw.slice(0, eq);
          const value = eq === -1 ? "" : raw.slice(eq + 1);
          return { name, value, raw };
        });
      setCookieReport({
        sameOrigin: window.location.origin,
        cookies: sameOriginCookies,
      });

      // 2. Better-Auth-Session-Endpoint
      try {
        const r = await fetch("/api/auth/get-session", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        let body: unknown = null;
        try {
          body = await r.json();
        } catch {
          body = await r.text().catch(() => null);
        }
        setAuthSession({ status: r.status, body });
      } catch (e) {
        setAuthSession({ status: -1, body: String(e) });
      }

      // 3. App-Standard-Check /api/me
      try {
        const r = await fetch("/api/me", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        let body: unknown = null;
        try {
          body = await r.json();
        } catch {
          body = await r.text().catch(() => null);
        }
        setMeResult({ status: r.status, body });
      } catch (e) {
        setMeResult({ status: -1, body: String(e) });
      }

      // 4. Server-Config
      try {
        const r = await fetch("/api/capabilities", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        let body: unknown = null;
        try {
          body = await r.json();
        } catch {
          body = await r.text().catch(() => null);
        }
        setCapabilitiesResult({ status: r.status, body });
      } catch (e) {
        setCapabilitiesResult({ status: -1, body: String(e) });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-run on mount + when snapshot refreshes
  useEffect(() => {
    void runAll();
  }, [runAll, snap]);

  const results: AuthResult[] = [
    {
      name: "Better-Auth Session (offiziell)",
      ok: authSession?.status === 200,
      detail:
        authSession == null
          ? "noch nicht geprüft"
          : authSession.status === 200
            ? "200 — Session da"
            : `${authSession.status} — ${
              typeof authSession.body === "object" && authSession.body != null
                ? JSON.stringify(authSession.body)
                : String(authSession.body ?? "")
            }`,
      raw: authSession,
    },
    {
      name: "/api/me (App-Standard)",
      ok: meResult?.status === 200,
      detail:
        meResult == null
          ? "noch nicht geprüft"
          : meResult.status === 200
            ? "200 — User vorhanden"
            : `${meResult.status} — ${
              typeof meResult.body === "object" && meResult.body != null
                ? JSON.stringify(meResult.body)
                : String(meResult.body ?? "")
            }`,
      raw: meResult,
    },
    {
      name: "/api/capabilities (Server-Config)",
      ok: capabilitiesResult?.status === 200,
      detail:
        capabilitiesResult == null
          ? "noch nicht geprüft"
          : capabilitiesResult.status === 200
            ? `200 — authProviders: ${
              (
                (capabilitiesResult.body as { authProviders?: string[] })
                  ?.authProviders ?? []
              ).join(", ") || "(keine)"
            }`
            : `${capabilitiesResult.status} — Server nicht erreichbar`,
      raw: capabilitiesResult,
    },
    {
      name: "Browser-Cookie für Origin",
      ok: (cookieReport?.cookies.length ?? 0) > 0,
      detail:
        cookieReport == null
          ? "noch nicht geprüft"
          : cookieReport.cookies.length === 0
            ? `Keine Cookies für ${cookieReport.sameOrigin}`
            : `${cookieReport.cookies.length} Cookie(s): ${cookieReport.cookies
              .map((c) => c.name)
              .join(", ")}`,
      raw: cookieReport,
    },
  ];

  const allOk = results.every((r) => r.ok);

  return (
    <section
      data-test="auth-workbench"
      className={cn(
        "rounded-2xl border p-4",
        allOk
          ? "border-emerald-500/30 bg-emerald-500/[0.05]"
          : "border-amber-500/30 bg-amber-500/[0.05]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Auth-Werkzeugbank
          </h2>
          <p className="text-[12px] text-white/55">
            Login → Cookie → Session → App. Hier siehst du jeden Schritt einzeln.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void runAll()}
            disabled={busy}
          >
            <IconRefresh className={cn("size-3.5", busy && "animate-spin")} />
            Alle 4 prüfen
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRefresh()}
            disabled={busy}
          >
            Snapshot
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {results.map((r) => (
          <li
            key={r.name}
            className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 p-2.5 text-[12px]"
          >
            {r.ok ? (
              <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            ) : (
              <IconCircleX className="mt-0.5 size-4 shrink-0 text-amber-400" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-white">{r.name}</strong>
                <code className="text-white/60">{r.detail}</code>
              </div>
              {r.raw != null && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-white/40">
                    raw
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/70">
                    {JSON.stringify(r.raw, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[12px] text-white/80 hover:bg-white/[0.1]"
          to="/sign"
        >
          <IconExternalLink className="size-3" /> Zu /sign
        </Link>
        <a
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[12px] text-white/80 hover:bg-white/[0.1]"
          href="/api/auth/sign-out"
        >
          <IconExternalLink className="size-3" /> Sign-Out Endpoint
        </a>
        <a
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[12px] text-white/80 hover:bg-white/[0.1]"
          href="/sign?redirect=/settings/diagnose"
        >
          <IconExternalLink className="size-3" /> Sign-In mit Redirect zurück
        </a>
      </div>
    </section>
  );
}

function ToolLink({
  to,
  title,
  desc,
}: {
  to: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:border-white/20 hover:bg-white/[0.05]"
      to={to}
    >
      <IconExternalLink className="mt-0.5 size-4 shrink-0 text-white/40" />
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-[12px] text-white/50">{desc}</p>
      </div>
    </Link>
  );
}

function KV({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-white/55">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <code className="break-all text-white/85">{value}</code>
        {ok !== undefined && (
          <span
            aria-label={ok ? "OK" : "Problem"}
            className={cn(
              "size-2 shrink-0 rounded-full",
              ok ? "bg-emerald-400" : "bg-red-400",
            )}
            title={ok ? "OK" : "Problem"}
          />
        )}
      </dd>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Section definitions + probes — JEDER PROBE ist read-only
// ───────────────────────────────────────────────────────────────────────────

function defaultSections(): Section[] {
  return [
    {
      id: "auth",
      title: "Auth & Session",
      short: "Wer bin ich auf diesem Server? Warum kommt /api/me mit 401?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
    {
      id: "companies",
      title: "Companies-Store",
      short: "Sehen wir noch Nordwind, Lumen, Helm, Pulse? Storage-State?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
    {
      id: "shortcuts",
      title: "Shortcuts (Alt+Shift+S)",
      short: "Welche Tastenkombi ist registriert? Warum geht sie nicht?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
    {
      id: "mobile-sheet",
      title: "Mobile Profile-Sheet",
      short: "Spinner-Stand des Profil-Sheets — geladen, offen, hängt?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
    {
      id: "build",
      title: "Build-Sync (lokal ↔ Vercel)",
      short: "Welcher Bundle-Hash läuft hier? Matched der mit Vercel?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
    {
      id: "network",
      title: "Network & Origin",
      short: "Wo glaubt die App, dass sie ist? Trustworthy Origins?",
      status: "idle",
      message: "Noch nicht geprüft.",
    },
  ];
}

async function runProbe(
  id: string,
  snap: Snapshot,
): Promise<Partial<Section>> {
  switch (id) {
    case "auth": {
      const me = snap.apiMe;
      if (!me) {
        return { status: "warn", message: "Kein API-Call möglich (kein Snapshot?)" };
      }
      if (me.status === 200) {
        const u = (me.body as { user?: { email?: string; name?: string } })?.user;
        return {
          status: "ok",
          message: `Eingeloggt als ${u?.email ?? "?"} (${u?.name ?? "?"})`,
          details: me.body,
        };
      }
      if (me.status === 401) {
        return {
          status: "warn",
          message:
            "401 — Server lehnt Auth ab. Fallback: Single-User-Modus aktivieren oder Google-OAuth geradeziehen.",
          details: me.body,
        };
      }
      return { status: "error", message: `Unerwarteter Status ${me.status}`, details: me.body };
    }
    case "companies": {
      const seedCount = snap.companies.filter((c) => c.isSeed).length;
      if (seedCount === 0) {
        return {
          status: "ok",
          message: `Keine Seed-Unternehmen sichtbar (${snap.companies.length} Custom-Unternehmen).`,
        };
      }
      return {
        status: "warn",
        message: `${seedCount} Seed-Unternehmen noch sichtbar. → /settings/diagnose-companies zum Aufräumen.`,
      };
    }
    case "shortcuts": {
      const shortcuts = (snap.shortcuts ?? {}) as Record<string, { key?: string }>;
      const shell = shortcuts["shell-toggle"]?.key ?? "(nicht gesetzt)";
      return {
        status: "idle",
        message: `Aktuelle Belegung: shell-toggle = ${shell}. Fallback bei Crash: localStorage-Key manuell löschen.`,
        details: shortcuts,
      };
    }
    case "mobile-sheet": {
      // Read-only: profile-card state prüfen
      return {
        status: "idle",
        message:
          "Profil-Sheet ist eine Mobile-Komponente — auf Desktop nicht direkt sichtbar. Öffne die App in Mobile-Ansicht (DevTools) oder in der Connect-App.",
      };
    }
    case "build": {
      const bundleMatch = /assets\/index-([\w]+)\.js/.exec(snap.href);
      return {
        status: "idle",
        message: "Diese Page selbst lädt den lokalen Bundle. Auf Vercel ist es ein anderer Hash.",
        details: {
          href: snap.href,
          // hash kann nicht direkt aus window ausgelesen werden — schau im HTML
        },
      };
    }
    case "network": {
      const trustedOrigin = snap.origin === "http://localhost:3101";
      return {
        status: trustedOrigin ? "ok" : "warn",
        message: trustedOrigin
          ? `Origin ${snap.origin} ist loopback — passt zur Single-User-Annahme.`
          : `Origin ${snap.origin} ist nicht loopback — Auth-Mode prüfen.`,
      };
    }
    default:
      return { status: "idle", message: "Kein Probe definiert." };
  }
}

function summarizeBody(body: unknown): string {
  if (body === null || body === undefined) return "—";
  if (typeof body === "string") return body.slice(0, 240);
  try {
    return JSON.stringify(body, null, 2).slice(0, 600);
  } catch {
    return String(body);
  }
}
