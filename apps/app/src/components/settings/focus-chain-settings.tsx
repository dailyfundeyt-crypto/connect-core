import { IconArrowDown, IconArrowUp, IconRestore } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { BigBossLogo } from "@/components/focus/focus-chain";
import {
  defaultFocusChain,
  type FocusChainConfig,
  type FocusChainStep,
  getFocusChain,
  setFocusChain,
  subscribeFocusChain,
} from "@/lib/focus-chain";
import { cn } from "@/lib/utils";

const input =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[15px] text-[#1c1b19] outline-none focus:border-sky-500/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
const label = "mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#6b6862] dark:text-white/40";

/** Einstellungen › Fokus (helium-focuschain2): Big Boss + Kette, per Workspace-Sync gespeichert. */
export function FocusChainSettingsPanel() {
  const [cfg, setCfg] = useState<FocusChainConfig>(() => getFocusChain());
  useEffect(() => subscribeFocusChain(() => setCfg(getFocusChain())), []);

  const save = (next: FocusChainConfig) => {
    setCfg(next);
    setFocusChain(next);
  };
  const patchStep = (id: string, patch: Partial<FocusChainStep>) =>
    save({ ...cfg, steps: cfg.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cfg.steps.length) return;
    const steps = [...cfg.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    save({ ...cfg, steps });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="focus-settings">
      <div>
        <h2 className="font-semibold text-[20px] text-[#1c1b19] dark:text-white">Fokus</h2>
        <p className="mt-1 text-[14px] text-[#6b6862] dark:text-white/50">
          Big-Boss-Startseite und die Fokus-Kette. Erst denken, dann handeln. Wird mit deinem Konto auf allen Geräten abgeglichen.
        </p>
      </div>

      <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <div className="mb-4 flex items-center gap-4">
          <BigBossLogo size={72} src={cfg.bossLogo || undefined} />
          <div className="min-w-0 flex-1">
            <label className={label} htmlFor="fc-boss-name">Name</label>
            <input className={input} id="fc-boss-name" onChange={(e) => save({ ...cfg, bossName: e.target.value })} value={cfg.bossName} />
          </div>
        </div>
        <label className={label} htmlFor="fc-boss-link">Big-Boss-Bot-Link (Antippen des Logos)</label>
        <input className={input} id="fc-boss-link" inputMode="url" onChange={(e) => save({ ...cfg, bossLink: e.target.value })} placeholder="https://…/channel/…" value={cfg.bossLink} />
        <label className={cn(label, "mt-3")} htmlFor="fc-google">Google-Konto (Docs, Kontakte, Drive, Gmail)</label>
        <input className={input} id="fc-google" inputMode="email" onChange={(e) => save({ ...cfg, googleAccount: e.target.value })} placeholder="name@gmail.com (leer = Standardkonto)" value={cfg.googleAccount} />
        <label className={cn(label, "mt-3")} htmlFor="fc-boss-logo">Logo-Bild (URL, leer = Krone)</label>
        <input className={input} id="fc-boss-logo" inputMode="url" onChange={(e) => save({ ...cfg, bossLogo: e.target.value })} placeholder="https://… oder /brand/…png" value={cfg.bossLogo} />
      </section>

      <section className="flex flex-col gap-3">
        <p className={label}>Kette ({cfg.steps.filter((s) => s.enabled).length} aktiv) – Reihenfolge mit den Pfeilen</p>
        {cfg.steps.map((s, i) => (
          <div className={cn("rounded-2xl border border-black/10 p-4 dark:border-white/10", !s.enabled && "opacity-55")} key={s.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-black/5 text-[13px] font-semibold tabular-nums dark:bg-white/10 dark:text-white">{i + 1}</span>
              <input aria-label="Name" className={cn(input, "flex-1 font-semibold")} onChange={(e) => patchStep(s.id, { name: e.target.value })} value={s.name} />
              <button aria-label="Nach oben" className="flex size-9 items-center justify-center rounded-full border border-black/10 disabled:opacity-30 dark:border-white/10 dark:text-white" disabled={i === 0} onClick={() => move(i, -1)} type="button"><IconArrowUp className="size-4" /></button>
              <button aria-label="Nach unten" className="flex size-9 items-center justify-center rounded-full border border-black/10 disabled:opacity-30 dark:border-white/10 dark:text-white" disabled={i === cfg.steps.length - 1} onClick={() => move(i, 1)} type="button"><IconArrowDown className="size-4" /></button>
            </div>
            <label className={label}>Aufgabe</label>
            <input className={input} onChange={(e) => patchStep(s.id, { task: e.target.value })} value={s.task} />
            <label className={cn(label, "mt-3")}>Link</label>
            <input className={input} inputMode="url" onChange={(e) => patchStep(s.id, { url: e.target.value })} value={s.url} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Android-App (Paket)</label>
                <input className={input} onChange={(e) => patchStep(s.id, { android: e.target.value })} placeholder="optional" value={s.android ?? ""} />
              </div>
              <div>
                <label className={label}>iOS-App (Schema)</label>
                <input className={input} onChange={(e) => patchStep(s.id, { ios: e.target.value })} placeholder="optional" value={s.ios ?? ""} />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[14px] text-[#1c1b19] dark:text-white/80">
              <input checked={s.openMode !== "browser"} onChange={(e) => patchStep(s.id, { openMode: e.target.checked ? "app" : "browser" })} type="checkbox" /> in der App öffnen (sonst Browser)
            </label>
            <label className="mt-2 flex items-center gap-2 text-[14px] text-[#1c1b19] dark:text-white/80">
              Android-Start:
              <select className="rounded-lg border border-black/10 bg-transparent px-2 py-1 dark:border-white/10" onChange={(e) => patchStep(s.id, { intentStyle: e.target.value as "launcher" | "link" })} value={s.intentStyle ?? "launcher"}>
                <option value="launcher">App starten (Launcher)</option>
                <option value="link">Link in App (Deep-Link)</option>
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2 text-[14px] text-[#1c1b19] dark:text-white/80">
              <input checked={s.enabled} onChange={(e) => patchStep(s.id, { enabled: e.target.checked })} type="checkbox" /> in der Kette anzeigen
            </label>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <label className="flex items-center gap-2 text-[14px] text-[#1c1b19] dark:text-white/80">
          <input checked={cfg.agentCards} onChange={(e) => save({ ...cfg, agentCards: e.target.checked })} type="checkbox" />
          Alte Ansicht: Agenten-Karten / Timer statt Fokus-Kette (Handy)
        </label>
        <button
          className="mt-4 flex items-center gap-1.5 text-[13px] text-[#6b6862] dark:text-white/50"
          onClick={() => {
            if (window.confirm("Fokus auf Standardwerte zurücksetzen?")) save(defaultFocusChain());
          }}
          type="button"
        >
          <IconRestore className="size-4" /> Standardwerte wiederherstellen
        </button>
      </section>
    </div>
  );
}
