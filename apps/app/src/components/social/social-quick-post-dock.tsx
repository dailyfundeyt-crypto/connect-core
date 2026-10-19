import { IconBrandX, IconCopy, IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { brainFileQueryOptions } from "@/lib/brain/queries";
import { getCompany, readActiveCompanyId } from "@/lib/companies/store";
import { saveSocialDraft } from "@/lib/social/drafts";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { cn } from "@/lib/utils";

const POSITION_KEY = "connect.social.quick-post-position.v1";
const DESKTOP_POSITION_KEY = "connect.social.quick-post-position.desktop.v1";
const SIZE = 44;
const PLATFORMS = ["X", "Threads", "Instagram", "TikTok"];

function clamp(x: number, y: number) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - SIZE - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - SIZE - 8)),
  };
}

/** Draggable, lightweight mobile shortcut for saving cross-platform social drafts. */
export function SocialQuickPostDock() {
  const mobile = useMobileShell();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [body, setBody] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["X", "Threads"]);
  const [saved, setSaved] = useState(false);
  const today = new Date();
  const dailyPath = `Daily/Schnellnotiz-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
  const dailyNote = useQuery({ ...brainFileQueryOptions(dailyPath), enabled: mobile });
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const key = mobile ? POSITION_KEY : DESKTOP_POSITION_KEY;
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) || "null") as { x?: number; y?: number } | null;
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        setPosition(clamp(stored.x!, stored.y!));
        return;
      }
    } catch { /* use the default */ }
    const right = window.innerWidth - SIZE * 2 - 32;
    const bottom = window.innerHeight - SIZE - 24;
    setPosition(clamp(right, mobile ? Math.round(window.innerHeight * 0.56) : bottom));
  }, [mobile]);

  useEffect(() => {
    const resize = () => setPosition((current) => clamp(current.x, current.y));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getDraftContent = () => {
    const note = dailyNote.data?.content?.trim();
    return body.trim().replace(/@Notizen\b/g, note ? `\n\n> Tagesnotiz\n${note}` : "@Notizen");
  };

  const save = () => {
    if (!body.trim() || platforms.length === 0) return;
    saveSocialDraft({ body: getDraftContent(), platforms, companyId: readActiveCompanyId() ?? null });
    setSaved(true);
  };

  return (
    <>
      {open ? (
        <section
          aria-label="Social-Media-Entwurf"
          className="fixed z-[80] flex max-h-[min(520px,calc(100dvh-24px))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#101319]/90 text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
          role="dialog"
          style={{ left: Math.max(12, Math.min(position.x + SIZE - 360, window.innerWidth - 372)), bottom: Math.max(12, window.innerHeight - position.y + 8) }}
        >
          <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-sky-300/10 text-sky-200"><IconBrandX className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Social-Entwurf</p>
              <p className="truncate text-[11px] text-white/40">{getCompany(readActiveCompanyId() ?? "")?.name ?? "Connect"} · lokal gespeichert</p>
            </div>
            <button aria-label="Schließen" className="rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} type="button"><IconX className="size-4" /></button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Zielplattformen">
              {PLATFORMS.map((platform) => {
                const active = platforms.includes(platform);
                return <button aria-pressed={active} className={cn("rounded-full border px-3 py-1.5 text-[11px] transition", active ? "border-sky-300/30 bg-sky-300/10 text-sky-100" : "border-white/10 text-white/45 hover:bg-white/[0.05]")} key={platform} onClick={() => { setSaved(false); setPlatforms((items) => active ? items.filter((item) => item !== platform) : [...items, platform]); }} type="button">{platform}</button>;
              })}
            </div>
            <textarea
              aria-label="Posttext"
              className="min-h-36 flex-1 resize-none bg-transparent text-[14px] leading-6 text-white outline-none placeholder:text-white/35"
              maxLength={5000}
              onChange={(event) => { setBody(event.target.value); setSaved(false); }}
              placeholder={'Post-Idee …  @Notizen fügt, falls vorhanden, deine heutige Tagesnotiz ein'}
              value={body}
            />
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3">
              <span className="text-[10px] text-white/35">{saved ? "Entwurf in Analysis gespeichert" : `${body.length} Zeichen`}</span>
              <div className="flex items-center gap-2">
                <button aria-label="Text kopieren" className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30" disabled={!body.trim()} onClick={() => void navigator.clipboard?.writeText(getDraftContent())} title="Text kopieren" type="button"><IconCopy className="size-4" /></button>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-full bg-sky-300/15 px-3 text-[12px] font-medium text-sky-100 transition hover:bg-sky-300/25 disabled:opacity-40" disabled={!body.trim() || platforms.length === 0} onClick={save} type="button"><IconDeviceFloppy className="size-4" />{saved ? "Gespeichert" : "Entwurf speichern"}</button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <button
        aria-label={open ? "Schnellpost schließen" : "Schnellpost erstellen"}
        aria-expanded={open}
        className="fixed z-[79] flex size-11 touch-none select-none items-center justify-center rounded-full border border-sky-200/20 bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-[0_8px_30px_rgba(56,189,248,0.28)] transition active:scale-95"
        data-testid="social-quick-post-fab"
        onPointerCancel={() => { drag.current = null; }}
        onPointerDown={(event) => {
          drag.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, ox: position.x, oy: position.y, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          const dx = event.clientX - active.sx;
          const dy = event.clientY - active.sy;
          if (!active.moved && Math.hypot(dx, dy) < 6) return;
          active.moved = true;
          setPosition(clamp(active.ox + dx, active.oy + dy));
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          drag.current = null;
          if (!active) return;
          if (active.moved) {
            const next = clamp(active.ox + event.clientX - active.sx, active.oy + event.clientY - active.sy);
            setPosition(next);
            window.localStorage.setItem(mobile ? POSITION_KEY : DESKTOP_POSITION_KEY, JSON.stringify(next));
          } else {
            setSaved(false);
            setOpen((value) => !value);
          }
        }}
        style={{ left: position.x, top: position.y, visibility: position.x || position.y ? "visible" : "hidden" }}
        type="button"
      >
        {open ? <IconX className="size-5" stroke={1.8} /> : <IconPlus className="size-5" stroke={1.8} />}
      </button>
    </>
  );
}
