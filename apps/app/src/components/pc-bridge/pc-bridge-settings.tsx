import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck, IconCircleX, IconDeviceMobile, IconDownload, IconLoader2 } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { PageRows } from "@/components/layout/page-shell";
import { PcBridgePill } from "@/components/pc-bridge/pc-bridge-pill";
import { client } from "@/lib/client";
import {
  lastSeenText,
  type PcBridgeLocalWorker,
  type PcBridgeStatus,
  type PcProviderInfo,
  pcBridgeKeys,
  pcGrokBotsQuery,
  savePcAgentLink,
} from "@/lib/pc-bridge/api";

function ProviderRows({ providers }: { providers: PcProviderInfo[] }) {
  if (providers.length === 0) return <p className="text-[12.5px] text-muted-foreground">Anbieter-Status kommt mit dem nächsten Lebenszeichen vom PC.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {providers.map((provider) => (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2" key={provider.kind}>
          <span className="text-sm font-medium">{provider.label}</span>
          <span className={`flex items-center gap-1 text-[12px] ${provider.ready ? "text-emerald-500" : "text-muted-foreground"}`}>
            {provider.ready ? <IconCircleCheck className="size-4" /> : <IconCircleX className="size-4" />}
            {provider.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Lokal (3101): läuft der PC-Worker, der Aufträge vom Handy abholt? */
export function PcBridgeLocalSection({ worker }: { worker: PcBridgeLocalWorker }) {
  const online = worker.connected && Boolean(worker.lastHeartbeat);
  return (
    <div className="mb-10">
      <SettingsSectionHeader
        description="Das Handy (connect-kunc-preview.vercel.app) schickt Nachrichten an PC-Agenten über eine Warteschlange; dieser PC holt sie über eine ausgehende Verbindung ab. Kein offener Port, kein Tunnel."
        title="Handy-Brücke"
      />
      <PageRows>
        <div className="flex flex-col gap-3 px-1" data-testid="pc-bridge-local">
          <div className="flex flex-wrap items-center gap-2">
            <PcBridgePill label={worker.label} online={online} />
            {worker.lastHeartbeat ? <span className="text-[12px] text-muted-foreground">Lebenszeichen {lastSeenText(worker.lastHeartbeat)}</span> : null}
            <span className="text-[12px] text-muted-foreground">
              · erledigt {worker.jobsDone}
              {worker.jobsFailed ? `, Fehler ${worker.jobsFailed}` : ""}
              {worker.activeJobs ? `, läuft ${worker.activeJobs}` : ""}
            </span>
          </div>
          {!worker.configured ? (
            <p className="text-[12.5px] text-amber-500">Nicht eingerichtet: Datei %LOCALAPPDATA%\ConnectApp\data\pc-bridge.env fehlt.</p>
          ) : null}
          {worker.lastError ? <p className="text-[12.5px] text-amber-500">{worker.lastError}</p> : null}
          <ProviderRows providers={worker.providers} />
          {worker.grokBotCount ? <p className="text-[12px] text-muted-foreground">{worker.grokBotCount} Grok Bots sind auf dem Handy wählbar.</p> : null}
          {worker.helium ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2" data-testid="helium-local">
              <span className="text-sm font-medium">Helium (Connect Sync)</span>
              <span className={`text-[12px] ${worker.helium.connected ? "text-emerald-500" : "text-muted-foreground"}`}>
                {worker.helium.connected
                  ? `verbunden · ${worker.helium.tabs} Tabs · ${worker.helium.windows} Fenster`
                  : `nicht verbunden · zuletzt ${lastSeenText(worker.helium.lastSeen)}`}
              </span>
              <span className="text-[12px] text-muted-foreground">
                · Handy-Befehle {worker.helium.commandsDone}
                {worker.helium.commandsFailed ? `, Fehler ${worker.helium.commandsFailed}` : ""}
              </span>
              {!worker.helium.connected ? (
                <span className="w-full text-[12px] text-muted-foreground">
                  Einmal laden: helium://extensions → Entwicklermodus → „Entpackte Erweiterung laden“ → C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\extensions\connect-sync
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </PageRows>
    </div>
  );
}

/** Online (Handy/Vercel): PC-Status + Grok Bots als eigene Agenten anlegen, die über den PC antworten. */
export function PcBridgeRelaySection({ status }: { status: Extract<PcBridgeStatus, { mode: "relay" }> }) {
  const queryClient = useQueryClient();
  const grok = useQuery(pcGrokBotsQuery(true));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const bots = grok.data?.bots ?? [];
  const chosen = useMemo(() => bots.filter((bot) => selected[bot.id] && !bot.agentId), [bots, selected]);
  const [done, setDone] = useState<{ ok: number; failed: string[] } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      let ok = 0;
      const failed: string[] = [];
      for (const bot of chosen) {
        try {
          const agent = await client<{ id: string }>("/api/agents", "agent", {
            method: "POST",
            body: {
              name: bot.name.slice(0, 80),
              title: (bot.title?.trim() || "Grok Bot").slice(0, 120),
              roleDescription: (bot.description?.trim() || `Grok Bot „${bot.name}“ – antwortet über deinen PC.`).slice(0, 4000),
              visibility: "private",
            },
            fallback: "Agent konnte nicht angelegt werden",
          });
          await savePcAgentLink(agent.id, { provider: "grok-bot", model: bot.id, label: bot.name });
          ok += 1;
        } catch (error) {
          failed.push(`${bot.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return { ok, failed };
    },
    onSuccess: async (result) => {
      setDone(result);
      setSelected({});
      await Promise.all([queryClient.invalidateQueries({ queryKey: pcBridgeKeys.all }), queryClient.invalidateQueries({ queryKey: ["agents"] })]);
    },
  });

  return (
    <>
      <SettingsSectionHeader
        description="Agenten, die über deinen PC antworten (Codex, Claude, Grok Bot), brauchen die laufende Connect App auf dem PC. Einstellen pro Agent unter Agent › Einstellungen › Modell."
        title="Dein PC"
      />
      <PageRows>
        <div className="flex flex-col gap-3 px-1" data-testid="pc-bridge-relay">
          <div className="flex flex-wrap items-center gap-2">
            <PcBridgePill label={status.label} online={status.online} />
            <span className="text-[12px] text-muted-foreground">zuletzt {lastSeenText(status.lastSeen)}</span>
            <span className="text-[12px] text-muted-foreground">· {status.links.length} Agent(en) verknüpft</span>
          </div>
          <ProviderRows providers={status.providers} />
          <Link
            className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5 text-sm font-medium"
            hash="mein-helium"
            to="/settings"
          >
            <span>Mein Helium – Tabs am PC sehen und steuern</span>
            <span aria-hidden className="text-muted-foreground">›</span>
          </Link>
        </div>
      </PageRows>

      <div className="mt-10">
        <SettingsSectionHeader
          description="Deine Grok Bots vom PC. Häkchen setzen → jeder wird ein eigener Connect-Agent, der über deinen PC mit dem echten Grok Bot spricht."
          title="Grok Bots auswählen"
        />
        <PageRows>
          <div className="flex flex-wrap gap-2 px-1">
            <Button disabled={grok.isFetching} onClick={() => void grok.refetch()} type="button" variant="outline">
              <IconDeviceMobile className="size-4" />
              {grok.isFetching ? "Lade…" : "Liste aktualisieren"}
            </Button>
            <Button disabled={chosen.length === 0 || create.isPending} onClick={() => create.mutate()} type="button">
              {create.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconDownload className="size-4" />}
              {create.isPending ? "Lege an…" : `Als Agent anlegen (${chosen.length})`}
            </Button>
          </div>
          {done ? (
            <p className="px-1 text-sm text-muted-foreground">
              Angelegt: {done.ok}
              {done.failed.length ? ` · Fehler: ${done.failed.join("; ")}` : ""}
            </p>
          ) : null}
          <div className="mt-2 max-h-[420px] overflow-auto rounded-xl border border-border">
            {bots.length === 0 && !grok.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">
                {status.online ? "Keine Grok Bots gemeldet – ist die Grok-Bot-App am PC angemeldet?" : "PC offline – die Liste kommt, sobald die Connect App am PC läuft."}
              </p>
            ) : null}
            {bots.map((bot) => (
              <label className="flex cursor-pointer items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-0 hover:bg-muted/40" key={bot.id}>
                <input
                  checked={Boolean(selected[bot.id]) || Boolean(bot.agentId)}
                  className="mt-1 size-4"
                  disabled={Boolean(bot.agentId)}
                  onChange={() => setSelected((prev) => ({ ...prev, [bot.id]: !prev[bot.id] }))}
                  type="checkbox"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{bot.name}</span>
                    {bot.agentId ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">schon da</span> : null}
                  </div>
                  {bot.description ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{bot.description}</p> : null}
                </div>
              </label>
            ))}
          </div>
        </PageRows>
      </div>
    </>
  );
}
