import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowRight,
  IconBrowser,
  IconCamera,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconVolume,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/page-shell";
import { lastSeenText, pcBridgeStatusQuery } from "@/lib/pc-bridge/api";
import { type HeliumCommandInput, type HeliumTab, heliumBrowserQuery, heliumKeys, runHeliumCommand } from "@/lib/pc-bridge/helium-api";
import { cn } from "@/lib/utils";

const EXTENSION_PATH = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\extensions\\connect-sync";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[0] ?? url;
  }
}

function Favicon({ tab }: { tab: HeliumTab }) {
  const [broken, setBroken] = useState(false);
  if (tab.favIconUrl && !broken) {
    return <img alt="" className="size-5 shrink-0 rounded-[5px]" onError={() => setBroken(true)} src={tab.favIconUrl} />;
  }
  const letter = (hostOf(tab.url)[0] ?? "•").toUpperCase();
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-white/10 text-[10px] font-semibold text-white/70">{letter}</span>
  );
}

function StatusPill({ state }: { state: "connected" | "no-extension" | "offline" }) {
  const text = state === "connected" ? "Helium verbunden" : state === "no-extension" ? "Helium nicht verbunden" : "PC offline";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium",
        state === "connected" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        state === "no-extension" && "border-amber-500/30 bg-amber-500/10 text-amber-400",
        state === "offline" && "border-zinc-500/30 bg-zinc-500/10 text-muted-foreground",
      )}
      data-testid="helium-status"
    >
      <span
        className={cn(
          "size-2 rounded-full",
          state === "connected" ? "bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/70" : state === "no-extension" ? "bg-amber-400" : "bg-zinc-500",
        )}
      />
      {text}
    </span>
  );
}

function IconAction({ label, onClick, busy, children, danger }: { label: string; onClick: () => void; busy?: boolean; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/80 transition active:scale-95 disabled:opacity-40",
        danger ? "hover:bg-red-500/15 hover:text-red-300" : "hover:bg-white/10",
      )}
      disabled={busy}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

/** Einstellungen › Mein Helium: Tabs von Helium am PC sehen und steuern (Handy-Version). */
export function MeinHeliumPanel() {
  const status = useQuery(pcBridgeStatusQuery());
  const relay = status.data?.mode === "relay";
  const browser = useQuery(heliumBrowserQuery(relay));
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  const command = useMutation({
    mutationFn: async (input: HeliumCommandInput & { key: string }) => {
      const { key: _key, ...rest } = input;
      const started = Date.now();
      const result = await runHeliumCommand(rest);
      return { result, ms: Date.now() - started, action: rest.action };
    },
    onMutate: (input) => {
      setBusyKey(input.key);
      setMessage(null);
    },
    onSuccess: async ({ result, ms, action }) => {
      if (action === "screenshot") {
        const dataUrl = (result.result as { dataUrl?: string } | null)?.dataUrl;
        if (dataUrl?.startsWith("data:image/")) setShot(dataUrl);
      }
      setMessage({ text: `Erledigt in ${(ms / 1000).toFixed(1)} s` });
      await queryClient.invalidateQueries({ queryKey: heliumKeys.browser() });
    },
    onError: (error) => setMessage({ text: error instanceof Error ? error.message : String(error), error: true }),
    onSettled: () => setBusyKey(null),
  });
  const send = (key: string, input: HeliumCommandInput) => command.mutate({ ...input, key });

  const data = browser.data;
  const groups = useMemo(() => {
    if (!data) return [];
    const byWindow = new Map<number, HeliumTab[]>();
    for (const tab of data.tabs) byWindow.set(tab.windowId, [...(byWindow.get(tab.windowId) ?? []), tab]);
    const order = [...data.windows].sort((a, b) => Number(b.focused) - Number(a.focused));
    const ids = order.map((w) => w.id).filter((id) => byWindow.has(id));
    for (const id of byWindow.keys()) if (!ids.includes(id)) ids.push(id);
    return ids.map((id) => ({
      id,
      focused: data.windows.find((w) => w.id === id)?.focused ?? false,
      tabs: (byWindow.get(id) ?? []).sort((a, b) => a.index - b.index),
    }));
  }, [data]);

  if (status.data && !relay) {
    return (
      <PageSection description="Steuert Helium am PC vom Handy aus. Diese Ansicht ist für die Handy-/Online-Version gedacht." title="Mein Helium">
        <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Hier am PC siehst du den Status der Erweiterung unter Einstellungen › Anbieter-CLIs › Handy-Brücke. Erweiterung einmal laden: helium://extensions →
          Entwicklermodus → „Entpackte Erweiterung laden“ → <code className="text-[12px]">{EXTENSION_PATH}</code>
        </div>
      </PageSection>
    );
  }

  const state: "connected" | "no-extension" | "offline" = !data?.pcOnline ? "offline" : data.extConnected ? "connected" : "no-extension";
  const busy = command.isPending;

  return (
    <PageSection description="Deine Tabs in Helium am PC – live über deine Connect App. Tippen zum Aktivieren." title="Mein Helium">
      <div className="flex flex-col gap-4" data-testid="mein-helium">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 shadow-[0_10px_40px_-20px_rgba(56,189,248,0.35)]">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill state={state} />
            <span className="text-[12px] text-muted-foreground">
              {state === "connected"
                ? `${data?.tabs.length ?? 0} Tabs · ${data?.windows.length ?? 0} Fenster`
                : state === "offline"
                  ? `PC zuletzt gesehen ${lastSeenText(data?.pcLastSeen ?? null)}`
                  : `Helium zuletzt gesehen ${lastSeenText(data?.extSeen ?? null)}`}
            </span>
            {browser.isFetching ? <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          {state === "no-extension" ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-amber-200/80">
              Die Connect App läuft, aber Helium meldet sich nicht. Ist Helium offen und die Erweiterung „Connect Sync“ geladen? (helium://extensions →
              Entwicklermodus → Entpackte laden → <span className="break-all">{EXTENSION_PATH}</span>)
            </p>
          ) : null}
          {state === "offline" ? <p className="mt-3 text-[12.5px] text-muted-foreground">Starte die Connect App am PC – Helium verbindet sich danach von selbst.</p> : null}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!url.trim()) return;
              send("open", { action: "open", url: url.trim() });
              setUrl("");
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
              <IconWorld className="size-4 shrink-0 text-white/40" />
              <input
                autoCapitalize="none"
                autoCorrect="off"
                className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
                disabled={state !== "connected"}
                inputMode="url"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Adresse in neuem Tab öffnen"
                value={url}
              />
            </div>
            <button
              className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-b from-white to-zinc-300 px-3.5 text-[13px] font-semibold text-black disabled:opacity-40"
              disabled={state !== "connected" || !url.trim() || busy}
              type="submit"
            >
              {busyKey === "open" ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlus className="size-4" />}
              Öffnen
            </button>
          </form>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-white/60 hover:bg-white/5 disabled:opacity-40"
              disabled={state !== "connected" || busy}
              onClick={() => send("shot", { action: "screenshot" })}
              type="button"
            >
              {busyKey === "shot" ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCamera className="size-3.5" />}
              Screenshot aktiver Tab
            </button>
            {message ? <span className={cn("text-[12px]", message.error ? "text-red-300" : "text-emerald-400")}>{message.text}</span> : null}
          </div>
        </div>

        {shot ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10">
            <img alt="Screenshot des aktiven Tabs" className="w-full" src={shot} />
            <button aria-label="Screenshot schließen" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white" onClick={() => setShot(null)} type="button">
              <IconX className="size-4" />
            </button>
          </div>
        ) : null}

        {groups.map((group, index) => (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" key={group.id}>
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/70">
                <IconBrowser className="size-4" />
                Fenster {index + 1}
                {group.focused ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10.5px] text-sky-300">vorne</span> : null}
              </span>
              <button
                className="rounded-lg px-2 py-1 text-[12px] text-white/60 hover:bg-white/5 disabled:opacity-40"
                disabled={state !== "connected" || busy}
                onClick={() => send(`focus-${group.id}`, { action: "focusWindow", windowId: group.id })}
                type="button"
              >
                {busyKey === `focus-${group.id}` ? <IconLoader2 className="size-3.5 animate-spin" /> : "Fokussieren"}
              </button>
            </div>
            <ul>
              {group.tabs.map((tab) => (
                <li className={cn("border-b border-white/5 last:border-0", tab.active && "bg-white/[0.04]")} key={tab.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
                      disabled={state !== "connected" || busy}
                      onClick={() => send(`act-${tab.id}`, { action: "activate", tabId: tab.id })}
                      type="button"
                    >
                      <Favicon tab={tab} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("truncate text-[14px]", tab.active ? "font-semibold text-white" : "text-white/85")}>{tab.title || hostOf(tab.url)}</span>
                          {tab.audible ? <IconVolume className="size-3.5 shrink-0 text-sky-300" /> : null}
                        </span>
                        <span className="block truncate text-[11.5px] text-white/40">{hostOf(tab.url)}</span>
                      </span>
                      {busyKey === `act-${tab.id}` ? <IconLoader2 className="size-4 animate-spin text-white/50" /> : null}
                    </button>
                    <IconAction busy={state !== "connected" || busy} label="Neu laden" onClick={() => send(`rel-${tab.id}`, { action: "reload", tabId: tab.id })}>
                      {busyKey === `rel-${tab.id}` ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
                    </IconAction>
                    <IconAction
                      busy={state !== "connected" || busy}
                      label="Adresse ändern"
                      onClick={() => {
                        setEditing(editing === tab.id ? null : tab.id);
                        setEditUrl(tab.url);
                      }}
                    >
                      <IconArrowRight className="size-4" />
                    </IconAction>
                    <IconAction busy={state !== "connected" || busy} danger label="Tab schließen" onClick={() => send(`close-${tab.id}`, { action: "close", tabId: tab.id })}>
                      {busyKey === `close-${tab.id}` ? <IconLoader2 className="size-4 animate-spin" /> : <IconX className="size-4" />}
                    </IconAction>
                  </div>
                  {editing === tab.id ? (
                    <form
                      className="flex gap-2 px-4 pb-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editUrl.trim()) return;
                        send(`nav-${tab.id}`, { action: "navigate", tabId: tab.id, url: editUrl.trim() });
                        setEditing(null);
                      }}
                    >
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-[13px] text-white outline-none"
                        inputMode="url"
                        onChange={(event) => setEditUrl(event.target.value)}
                        value={editUrl}
                      />
                      <button className="rounded-lg bg-white/90 px-3 text-[12.5px] font-semibold text-black" type="submit">
                        Los
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {data && data.tabs.length === 0 && state === "connected" ? <p className="px-1 text-sm text-muted-foreground">Keine Tabs gemeldet.</p> : null}
        {browser.data === null ? <p className="px-1 text-sm text-muted-foreground">Dieser Server kennt „Mein Helium“ noch nicht.</p> : null}
        <p className="px-1 text-[11.5px] leading-relaxed text-white/35">
          Befehle laufen Handy → Online-Datenbank → Connect App am PC (holt jede Sekunde ab) → Helium. Üblich 1–3 s. Nur deine Sitzung, signiert; keine Ausführung von Code in Webseiten.
        </p>
      </div>
    </PageSection>
  );
}
