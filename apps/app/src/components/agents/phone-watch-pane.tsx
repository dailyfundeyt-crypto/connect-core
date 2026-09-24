import {
  IconDeviceMobile,
  IconLoader2,
  IconPlugConnected,
  IconRefresh,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  connectPhoneWifi,
  fetchPhoneHostStatus,
  fetchPhoneScreenshot,
  getAgentPhonePrefs,
  setAgentPhonePrefs,
  subscribeAgentPhone,
  type PhoneDevice,
  type PhoneHostStatus,
} from "@/lib/agents/agent-phone";
import { cn } from "@/lib/utils";

/**
 * Watch pane for Smartphone runtime — pick ADB device, Wi‑Fi pair, live screencap.
 * Stack: Android Platform-Tools (adb) + Genymobile/scrcpy (optional mirror).
 */
export function PhoneWatchPane({
  agentId,
  name,
  onBound,
}: {
  agentId: string;
  name?: string;
  /** Called after a device is selected so the session can reboot. */
  onBound?: (serial: string) => void;
}) {
  const [host, setHost] = useState<PhoneHostStatus | null>(null);
  const [prefs, setPrefs] = useState(() => getAgentPhonePrefs(agentId));
  const [frame, setFrame] = useState<string | null>(null);
  const [wifiHost, setWifiHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refreshHost = useCallback(async () => {
    const next = await fetchPhoneHostStatus();
    setHost(next);
    return next;
  }, []);

  const refreshFrame = useCallback(
    async (serial?: string | null) => {
      const shot = await fetchPhoneScreenshot(
        serial ?? getAgentPhonePrefs(agentId).serial,
      );
      if (shot.dataUrl) setFrame(shot.dataUrl);
      if (shot.error) setNote(shot.error);
      else setNote(null);
      return shot;
    },
    [agentId],
  );

  useEffect(() => {
    const sync = () => setPrefs(getAgentPhonePrefs(agentId));
    sync();
    return subscribeAgentPhone(sync);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        await refreshHost();
        if (!cancelled) await refreshFrame();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    const id = window.setInterval(() => {
      void refreshFrame();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [agentId, refreshFrame, refreshHost]);

  const bindDevice = (device: PhoneDevice) => {
    const next = setAgentPhonePrefs(agentId, {
      serial: device.serial,
      label: device.model || device.product || device.serial,
    });
    setPrefs(next);
    onBound?.(device.serial);
    void refreshFrame(device.serial);
  };

  const onWifiConnect = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await connectPhoneWifi(wifiHost);
      setNote(result.message);
      const status = await refreshHost();
      if (result.ok && result.serial) {
        const device =
          status.devices.find((d) => d.serial === result.serial) ??
          ({
            serial: result.serial,
            state: "device",
          } satisfies PhoneDevice);
        bindDevice(device);
      }
    } finally {
      setBusy(false);
    }
  };

  const online = (host?.devices ?? []).filter((d) => d.state === "device");
  const offline = (host?.devices ?? []).filter((d) => d.state !== "device");

  return (
    <div className="flex flex-col gap-3">
      <figure className="overflow-hidden rounded-2xl border bg-[#0c0c0e]">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <IconDeviceMobile className="size-3.5 text-emerald-400" />
          <div className="min-w-0 flex-1 truncate text-[11px] text-white/70">
            {prefs.label || prefs.serial || name || "Smartphone"} · ADB
            {host?.scrcpy ? " + scrcpy" : ""}
          </div>
          <Button
            aria-label="Geräte neu laden"
            className="size-7 text-white/80 hover:bg-white/10 hover:text-white"
            disabled={busy}
            onClick={() => {
              void refreshHost().then(() => refreshFrame());
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconRefresh className="size-3.5" />
          </Button>
        </div>
        <div className="relative flex aspect-[9/16] max-h-[28rem] w-full items-center justify-center bg-black">
          {frame ? (
            <img
              alt="Android-Spiegel"
              className="max-h-full max-w-full object-contain"
              src={frame}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-white/60">
              {busy ? (
                <IconLoader2 className="size-7 animate-spin" />
              ) : (
                <IconDeviceMobile className="size-8" />
              )}
              <p className="text-sm">
                {busy ? "Verbinde…" : "Kein Spiegelbild"}
              </p>
              <p className="max-w-xs text-[11px] leading-relaxed">
                USB-Debugging an, Gerät freigeben — oder Wi‑Fi-ADB unten.
                Open-Source: adb + scrcpy (Genymobile).
              </p>
            </div>
          )}
        </div>
      </figure>

      <div className="rounded-2xl border border-border p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Verbundene Geräte
        </p>
        {!host?.adb ? (
          <p className="text-xs text-destructive">
            {host?.message ??
              "ADB fehlt. Android Platform-Tools installieren, Connect Desktop neu starten."}
          </p>
        ) : online.length === 0 && offline.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Geräte. Kabel anschließen oder Wi‑Fi-ADB nutzen.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {online.map((device) => (
              <li key={device.serial}>
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs hover:bg-muted",
                    prefs.serial === device.serial && "bg-muted font-medium",
                  )}
                  onClick={() => bindDevice(device)}
                  type="button"
                >
                  <IconDeviceMobile className="size-3.5 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate">
                    {device.model || device.product || device.serial}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      {device.serial}
                    </span>
                  </span>
                  {prefs.serial === device.serial ? (
                    <span className="text-[10px] text-muted-foreground">
                      aktiv
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {offline.map((device) => (
              <li
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground"
                key={device.serial}
              >
                <IconDeviceMobile className="size-3.5 opacity-40" />
                <span className="truncate">
                  {device.serial} · {device.state}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
          <Input
            aria-label="Wi-Fi ADB Host"
            className="h-8 text-xs"
            onChange={(e) => setWifiHost(e.target.value)}
            placeholder="192.168.1.20:5555"
            value={wifiHost}
          />
          <Button
            className="h-8 shrink-0 gap-1 rounded-xl px-2.5 text-xs"
            disabled={busy || !wifiHost.trim()}
            onClick={() => void onWifiConnect()}
            size="sm"
            type="button"
          >
            <IconPlugConnected className="size-3.5" />
            Wi‑Fi
          </Button>
        </div>

        {note ? (
          <p
            className={cn(
              "mt-2 text-[11px]",
              note.toLowerCase().includes("fail") ||
                note.toLowerCase().includes("fehl") ||
                note.toLowerCase().includes("unable")
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            role="status"
          >
            {note}
          </p>
        ) : host?.message ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{host.message}</p>
        ) : null}

        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Stack:{" "}
          <a
            className="underline underline-offset-2"
            href="https://developer.android.com/tools/releases/platform-tools"
            rel="noreferrer"
            target="_blank"
          >
            adb
          </a>{" "}
          +{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/Genymobile/scrcpy"
            rel="noreferrer"
            target="_blank"
          >
            scrcpy
          </a>
          . Für Agent-Steuerung später MCP (z. B. scrcpy-mcp). Jedes Handy =
          eigenes Gerät — kein gemeinsames PC-Chrome-Fingerprint.
        </p>
      </div>
    </div>
  );
}
