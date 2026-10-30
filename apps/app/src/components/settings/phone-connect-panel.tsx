/**
 * Einstellungen › Handy verbinden (helium-tunnel).
 *
 * Zeigt die aktuelle Tunnel-URL (Cloudflare) und einen QR-Code mit Einmal-Kopplungstoken (10 min).
 * Das Handy oeffnet damit direkt diese lokale Connect App: gleiche Agenten, gleicher Stand.
 * Darunter die gekoppelten Geraete, einzeln entfernbar. Alle /api/tunnel/*-Aufrufe gehen nur lokal.
 */
import { IconDeviceMobile, IconRefresh, IconTrash, IconCopy } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Button } from "@/components/ui/button";

type TunnelStatus = {
  mode: string;
  status: string;
  url: string | null;
  error: string | null;
  lastReadyAt: string | null;
  binary: boolean;
  fixedUrl: boolean;
  devices: number;
};
type Device = { id: string; label: string; createdAt: string; lastSeenAt: string | null; userAgent: string };
type Pairing = { pairUrl: string; qrSvg: string; expiresAt: string };

const headers = { "x-connect-tunnel": "1", "content-type": "application/json" };
const STATUS_TEXT: Record<string, string> = {
  online: "Online",
  starting: "Startet …",
  offline: "Verbindet neu …",
  error: "Fehler",
  off: "Aus",
  "missing-binary": "cloudflared fehlt",
};

function isOnThisPc() {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
}

function when(value: string | null) {
  if (!value) return "–";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function PhoneConnectPanel() {
  const local = typeof window !== "undefined" && isOnThisPc();
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        fetch("/api/tunnel/status", { credentials: "same-origin" }),
        fetch("/api/tunnel/devices", { credentials: "same-origin" }),
      ]);
      if (s.ok) setStatus((await s.json()) as TunnelStatus);
      if (d.ok) setDevices(((await d.json()) as { devices: Device[] }).devices);
    } catch {}
  }, []);

  const newCode = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/tunnel/pair", { method: "POST", headers, credentials: "same-origin", body: "{}" });
    const body = (await r.json().catch(() => ({}))) as Partial<Pairing> & { error?: string };
    if (!r.ok || !body.qrSvg) {
      setPairing(null);
      setError(body.error ?? "QR-Code konnte nicht erzeugt werden.");
      return;
    }
    setPairing(body as Pairing);
  }, []);

  useEffect(() => {
    if (!local) return;
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [local, load]);

  // QR automatisch, sobald der Tunnel online ist; vor Ablauf erneuern; neu, wenn sich die URL aendert.
  useEffect(() => {
    if (!local || status?.status !== "online" || !status.url) return;
    if (!pairing || !pairing.pairUrl.startsWith(status.url) || new Date(pairing.expiresAt).getTime() - Date.now() < 30_000) {
      void newCode();
    }
  }, [local, status?.status, status?.url, pairing, newCode]);

  // Nach erfolgreicher Kopplung (neues Geraet) einen frischen Code zeigen.
  const [knownDevices, setKnownDevices] = useState<number | null>(null);
  useEffect(() => {
    if (knownDevices !== null && devices.length > knownDevices) void newCode();
    setKnownDevices(devices.length);
  }, [devices.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id: string) => {
    if (!window.confirm("Dieses Gerät entfernen? Es muss danach neu gekoppelt werden.")) return;
    await fetch(`/api/tunnel/devices/${encodeURIComponent(id)}`, { method: "DELETE", headers, credentials: "same-origin" });
    void load();
  };

  const restart = async () => {
    if (!window.confirm("Tunnel neu starten? Die Adresse wechselt dabei – bereits gekoppelte Handys müssen den neuen QR-Code einmal scannen.")) return;
    setPairing(null);
    await fetch("/api/tunnel/restart", { method: "POST", headers, credentials: "same-origin", body: "{}" });
    setTimeout(() => void load(), 3000);
  };

  if (!local) {
    return (
      <div>
        <SettingsSectionHeader title="Handy verbinden" description="Dieses Gerät ist mit der Connect App auf deinem PC verbunden." />
        <p className="text-sm text-muted-foreground">
          Du nutzt gerade direkt die Connect App deines PCs. Neue Geräte koppelst und entfernst du am PC unter
          Einstellungen › Handy verbinden.
        </p>
      </div>
    );
  }

  const online = status?.status === "online" && status.url;
  return (
    <div className="space-y-8">
      <SettingsSectionHeader
        title="Handy verbinden"
        description="Scanne den QR-Code mit der Handy-Kamera. Das Handy öffnet dann direkt diese Connect App auf deinem PC – gleiche Agenten, gleicher Stand, kein Sync."
      />

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <IconDeviceMobile className="size-5 text-sky-400" />
          <span className="font-medium text-white">Tunnel</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs ${online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
          >
            {status ? (STATUS_TEXT[status.status] ?? status.status) : "…"}
          </span>
          <span className="text-xs text-muted-foreground">
            {status?.fixedUrl ? "feste Adresse" : "Cloudflare Quick-Tunnel (Adresse wechselt, wenn der Tunnel neu startet – dann neu scannen)"}
          </span>
          <Button variant="outline" size="sm" className="ml-auto text-zinc-100" onClick={() => void restart()} disabled={status?.mode === "off"}>
            <IconRefresh className="size-4" /> Neu verbinden
          </Button>
        </div>
        {status?.url ? (
          <div className="mt-3 flex items-center gap-2">
            <code className="truncate rounded-lg bg-black/40 px-3 py-1.5 text-xs text-zinc-300">{status.url}</code>
            <Button
              variant="outline"
              size="sm"
              className="text-zinc-100"
              onClick={() => {
                void navigator.clipboard.writeText(status.url ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <IconCopy className="size-4" /> {copied ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        ) : null}
        {status?.mode === "off" ? (
          <p className="mt-3 text-sm text-amber-300">
            Der Tunnel ist aus. In connect.env CONNECT_TUNNEL_MODE=quick setzen (scripts/tunnel/setup-tunnel.ps1 erledigt das) und
            Connect neu starten.
          </p>
        ) : null}
        {status?.error && !online ? <p className="mt-3 text-sm text-amber-300">{status.error}</p> : null}
      </section>

      <section className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
        {pairing && online ? (
          <>
            <div
              className="size-64 overflow-hidden rounded-2xl bg-white p-2 [&_svg]:size-full"
              // SVG kommt vom eigenen lokalen Server (qrcode-generator), keine Fremddaten.
              dangerouslySetInnerHTML={{ __html: pairing.qrSvg }}
            />
            <p className="text-sm text-muted-foreground">
              Einmal-Code, gültig bis {new Date(pairing.expiresAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}{" "}
              Uhr. Nach dem Scannen „Koppeln“ tippen.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="text-zinc-100" onClick={() => void newCode()}>
                <IconRefresh className="size-4" /> Neuer Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-zinc-100"
                onClick={() => {
                  void navigator.clipboard.writeText(pairing.pairUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }}
              >
                <IconCopy className="size-4" /> {linkCopied ? "Link kopiert" : "Link kopieren"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Der Link gilt 10 Minuten und koppelt genau ein Gerät. Nur an eigene Geräte schicken.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{error ?? "QR-Code erscheint, sobald der Tunnel online ist …"}</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Gekoppelte Geräte ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Gerät gekoppelt.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <IconDeviceMobile className="size-5 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{d.label}</div>
                  <div className="text-xs text-muted-foreground">
                    gekoppelt {when(d.createdAt)} · zuletzt aktiv {when(d.lastSeenAt)}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-zinc-100" onClick={() => void remove(d.id)} aria-label="Gerät entfernen">
                  <IconTrash className="size-4" /> Entfernen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
