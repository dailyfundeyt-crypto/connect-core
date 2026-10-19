import {
  IconArrowLeft,
  IconCheck,
  IconDeviceDesktop,
  IconDots,
  IconFolder,
  IconFolderPlus,
  IconHeadphones,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { listCustomAudioTracks } from "@/lib/audio/custom-audio-store";
import type { BrainFmTrack } from "@/lib/audio/brainfm-tracks";
import { focusAudio } from "@/lib/audio/focus-audio";
import {
  addToPlaylist,
  builtinFolders,
  createPlaylist,
  deletePlaylist,
  localToTrack,
  moveTrack,
  type MusicPlaylist,
  removeFromPlaylist,
  renamePlaylist,
  resolveTrack,
  setMusicQueue,
  uploadToPc,
  useLocalMusic,
  usePlaylists,
} from "@/lib/audio/music-library";
import { cn } from "@/lib/utils";
import { useFocusAudio } from "@/components/focus/mobile-music-card";

/**
 * Ordner-Ansicht für „Musik & Beats“ (Handy-Vollansicht + PC-Dialog): eigene Ordner/Playlists,
 * PC-Musik (Downloads/Musik vom lokalen Server) und die vorgefertigten Ordner.
 * Ordner sind Zuordnungen – auf der Platte wird nichts verschoben oder gelöscht.
 */

type View = { kind: "root" } | { kind: "pc" } | { kind: "zone"; id: string } | { kind: "list"; id: string };

const T = {
  dark: {
    row: "bg-white/[0.04] active:bg-white/[0.08] hover:bg-white/[0.07]",
    muted: "text-white/45",
    faint: "text-white/30",
    text: "text-white",
    chip: "border-white/10 bg-white/[0.05] text-white/80",
    input: "bg-white/[0.06] text-white ring-white/15 placeholder:text-white/35",
    overlay: "bg-[#0d0e12]",
    line: "border-white/10",
  },
  light: {
    row: "bg-zinc-100 hover:bg-zinc-200/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
    muted: "text-zinc-500 dark:text-white/45",
    faint: "text-zinc-400 dark:text-white/30",
    text: "text-zinc-900 dark:text-white",
    chip: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80",
    input: "bg-zinc-100 text-zinc-900 ring-zinc-200 dark:bg-white/[0.06] dark:text-white dark:ring-white/15",
    overlay: "bg-white dark:bg-[#121212]",
    line: "border-zinc-200 dark:border-white/10",
  },
};

export function MusicLibraryPanel({ dark = true, className }: { dark?: boolean; className?: string }) {
  const t = dark ? T.dark : T.light;
  const playlists = usePlaylists();
  const [local, refreshLocal] = useLocalMusic();
  const [view, setView] = useState<View>({ kind: "root" });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const zones = useMemo(() => builtinFolders(), []);
  const pcTracks = useMemo(() => local.tracks.map(localToTrack), [local.tracks]);
  // Songs, die früher nur in diesem Browser hochgeladen wurden (IndexedDB) → auf den PC übernehmen
  const [uploads, setUploads] = useState<{ blob: Blob; filename: string }[]>([]);
  const [sync, setSync] = useState<"idle" | "busy" | "done">("idle");
  useEffect(() => {
    if (local.status !== "ok") return;
    let alive = true;
    void listCustomAudioTracks().then((list) => {
      if (!alive) return;
      const known = new Set(local.tracks.map((x) => `${x.filename}|${x.size}`));
      setUploads(list.filter((c) => !known.has(`${c.filename}|${c.size}`)).map((c) => ({ blob: c.blob, filename: c.filename })));
    });
    return () => {
      alive = false;
    };
  }, [local.status, local.tracks]);
  const syncUploads = async () => {
    setSync("busy");
    for (const u of uploads) await uploadToPc(u.blob, u.filename);
    setSync("done");
    setUploads([]);
    refreshLocal();
  };

  const create = () => {
    if (!name.trim()) return setCreating(false);
    const p = createPlaylist(name);
    setName("");
    setCreating(false);
    setView({ kind: "list", id: p.id });
  };

  if (view.kind !== "root") {
    const pl = view.kind === "list" ? playlists.find((p) => p.id === view.id) : undefined;
    const zone = view.kind === "zone" ? zones.find((z) => z.id === view.id) : undefined;
    if (view.kind === "list" && !pl) return null;
    const title = pl?.name ?? zone?.name ?? "PC-Musik";
    const items: { id: string; track: BrainFmTrack | null }[] = pl
      ? pl.trackIds.map((id) => ({ id, track: resolveTrack(id, local.tracks) }))
      : (zone?.tracks ?? pcTracks).map((tr) => ({ id: tr.id, track: tr }));
    return (
      <FolderView
        dark={dark}
        items={items}
        local={local}
        onBack={() => setView({ kind: "root" })}
        pcTracks={pcTracks}
        playlist={pl}
        playlists={playlists}
        refreshLocal={view.kind === "pc" ? refreshLocal : undefined}
        title={title}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="music-library">
      <div className="flex items-center justify-between">
        <p className={cn("text-[11px] font-medium uppercase tracking-[0.16em]", t.muted)}>Ordner</p>
        <button className={cn("flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] active:scale-95", t.chip)} data-testid="music-new-folder" onClick={() => setCreating(true)} type="button">
          <IconFolderPlus className="size-4" /> Neuer Ordner
        </button>
      </div>
      {creating ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input autoFocus className={cn("h-10 min-w-0 flex-1 rounded-2xl px-3 text-[16px] outline-none ring-1", t.input)} onChange={(e) => setName(e.target.value)} placeholder="z. B. Workout-Lieder" value={name} />
          <button className="h-10 rounded-2xl bg-emerald-500 px-4 text-[14px] font-semibold text-black active:scale-95" type="submit">
            Anlegen
          </button>
        </form>
      ) : null}

      {uploads.length > 0 ? (
        <div className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", t.row)} data-testid="music-upload-sync">
          <span className={cn("min-w-0 flex-1 text-[13px]", t.muted)}>
            {uploads.length} eigene Songs liegen nur in diesem Browser. Auf den PC übernehmen, damit sie auch auf dem Handy laufen (Musik\Connect).
          </span>
          <button className="h-9 shrink-0 rounded-full bg-emerald-500 px-3 text-[13px] font-semibold text-black disabled:opacity-50" disabled={sync === "busy"} onClick={() => void syncUploads()} type="button">
            {sync === "busy" ? "…" : "Übernehmen"}
          </button>
        </div>
      ) : null}
      {playlists.map((p) => (
        <PlaylistFolderRow count={p.trackIds.length} key={p.id} label={p.name} onClick={() => setView({ kind: "list", id: p.id })} playlist={p} t={t} />
      ))}
      <FolderRow
        count={local.status === "ok" ? pcTracks.length : undefined}
        icon={<IconDeviceDesktop className="size-5" />}
        label="PC-Musik"
        onClick={() => setView({ kind: "pc" })}
        sub={local.status === "loading" ? "lädt …" : local.status === "unavailable" ? "nur über den PC (3101 / QR-Tunnel)" : "Downloads & Musik vom PC"}
        t={t}
        testId="music-folder-pc"
        tint="bg-emerald-400/15 text-emerald-300"
      />
      {zones.map((z) => (
        <FolderRow count={z.tracks.length} icon={<IconHeadphones className="size-5" />} key={z.id} label={z.name} onClick={() => setView({ kind: "zone", id: z.id })} sub="Vorgefertigt" t={t} tint="bg-sky-400/15 text-sky-300" />
      ))}
    </div>
  );
}

function PlaylistFolderRow({ playlist, label, count, onClick, t }: { playlist: MusicPlaylist; label: string; count: number; onClick: () => void; t: (typeof T)["dark"] }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={cn("flex items-center gap-1 rounded-2xl p-1", t.row)}>
      <button className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left" onClick={onClick} type="button">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300"><IconFolder className="size-5" /></span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{label}</span>
        <span className={cn("text-[13px] tabular-nums", t.faint)}>{count}</span>
      </button>
      {confirm ? (
        <>
          <button aria-label={`${label} löschen`} className="h-9 shrink-0 rounded-full bg-rose-500/90 px-3 text-[12px] font-semibold text-white active:scale-95" onClick={() => deletePlaylist(playlist.id)} type="button">Löschen</button>
          <button aria-label="Abbrechen" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", t.muted)} onClick={() => setConfirm(false)} type="button"><IconX className="size-4" /></button>
        </>
      ) : (
        <button aria-label={`${label} löschen`} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", t.muted, "hover:text-rose-300")} onClick={() => setConfirm(true)} title="Playlist-Ordner löschen (Dateien bleiben erhalten)" type="button"><IconTrash className="size-4" /></button>
      )}
    </div>
  );
}

function FolderRow({ label, sub, count, icon, tint, onClick, t, testId }: { label: string; sub?: string; count?: number; icon: ReactNode; tint: string; onClick: () => void; t: (typeof T)["dark"]; testId?: string }) {
  return (
    <button className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", t.row)} data-testid={testId} onClick={onClick} type="button">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tint)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-medium", t.text)}>{label}</span>
        {sub ? <span className={cn("block truncate text-[12px]", t.muted)}>{sub}</span> : null}
      </span>
      {count != null ? <span className={cn("text-[13px] tabular-nums", t.faint)}>{count}</span> : null}
    </button>
  );
}

function FolderView({
  dark,
  title,
  items,
  playlist,
  playlists,
  pcTracks,
  local,
  refreshLocal,
  onBack,
  className,
}: {
  dark: boolean;
  title: string;
  items: { id: string; track: BrainFmTrack | null }[];
  playlist?: MusicPlaylist;
  playlists: MusicPlaylist[];
  pcTracks: BrainFmTrack[];
  local: ReturnType<typeof useLocalMusic>[0];
  refreshLocal?: () => void;
  onBack: () => void;
  className?: string;
}) {
  const t = dark ? T.dark : T.light;
  const s = useFocusAudio();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(title);
  const [menu, setMenu] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const playable = items.map((i) => i.track).filter((x): x is BrainFmTrack => !!x);

  const play = (tr: BrainFmTrack) => {
    setMusicQueue(playable);
    focusAudio.toggleBrainFmTrack(tr);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="music-folder-view">
      <div className="flex items-center gap-2">
        <button aria-label="Zurück" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border active:scale-95", t.chip)} onClick={onBack} type="button">
          <IconArrowLeft className="size-4" />
        </button>
        {renaming && playlist ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              renamePlaylist(playlist.id, newName);
              setRenaming(false);
            }}
          >
            <input autoFocus className={cn("h-9 min-w-0 flex-1 rounded-xl px-3 text-[16px] outline-none ring-1", t.input)} onChange={(e) => setNewName(e.target.value)} value={newName} />
            <button aria-label="Speichern" className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-black" type="submit">
              <IconCheck className="size-4" />
            </button>
          </form>
        ) : (
          <p className={cn("min-w-0 flex-1 truncate text-[17px] font-semibold", t.text)}>{title}</p>
        )}
        {playlist && !renaming ? (
          <button aria-label="Umbenennen" className={cn("flex size-9 items-center justify-center rounded-full border active:scale-95", t.chip)} data-testid="music-rename" onClick={() => setRenaming(true)} type="button">
            <IconPencil className="size-4" />
          </button>
        ) : null}
        {refreshLocal ? (
          <button aria-label="Neu einlesen" className={cn("flex size-9 items-center justify-center rounded-full border active:scale-95", t.chip)} onClick={refreshLocal} type="button">
            <IconRefresh className={cn("size-4", local.status === "loading" && "animate-spin")} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {playable.length > 0 ? (
          <button className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-[13px] font-semibold text-black active:scale-95" onClick={() => play(playable[0]!)} type="button">
            <IconPlayerPlayFilled className="size-4" /> Abspielen
          </button>
        ) : null}
        {playlist ? (
          <>
            <button className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] active:scale-95", t.chip)} data-testid="music-add-songs" onClick={() => setPicker(true)} type="button">
              <IconPlus className="size-4" /> Songs hinzufügen
            </button>
            {confirmDelete ? (
              <button
                className="flex h-9 items-center gap-1.5 rounded-full bg-red-500/90 px-3 text-[13px] font-medium text-white active:scale-95"
                onClick={() => {
                  deletePlaylist(playlist.id);
                  onBack();
                }}
                type="button"
              >
                <IconTrash className="size-4" /> Ordner wirklich entfernen?
              </button>
            ) : (
              <button className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] active:scale-95", t.chip)} onClick={() => setConfirmDelete(true)} type="button">
                <IconTrash className="size-4" /> Ordner entfernen
              </button>
            )}
          </>
        ) : null}
      </div>

      {refreshLocal && local.status === "unavailable" ? (
        <p className={cn("rounded-2xl px-3 py-3 text-[13px]", t.row, t.muted)}>
          PC-Musik kommt vom Connect-Server auf Stefans PC. Auf dem Handy über die 3101 per QR-Tunnel öffnen – in der Online-Vorschau ist der PC nicht erreichbar.
        </p>
      ) : null}
      {refreshLocal && local.status === "ok" && items.length === 0 ? (
        <p className={cn("rounded-2xl px-3 py-3 text-[13px]", t.row, t.muted)}>Keine Audiodateien in {local.folders.join(", ") || "Downloads/Musik"} gefunden.</p>
      ) : null}
      {playlist && items.length === 0 ? <p className={cn("px-1 py-2 text-[13px]", t.muted)}>Noch leer – „Songs hinzufügen“ tippen.</p> : null}

      <ul className="flex flex-col gap-1">
        {items.map(({ id, track }) => {
          const cur = s.currentTrack?.id === id;
          return (
            <li key={id}>
              <div className={cn("flex items-center gap-2 rounded-2xl px-2 py-1.5", cur && (dark ? "bg-white/[0.06]" : "bg-zinc-100 dark:bg-white/[0.06]"))}>
                <button className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left disabled:opacity-40" disabled={!track} onClick={() => track && play(track)} type="button">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", id.startsWith("pc:") ? "bg-emerald-400/15 text-emerald-300" : "bg-sky-400/15 text-sky-300")}>
                    {cur && s.isPlayingTrack ? <IconHeadphones className="size-4 animate-pulse" /> : <IconPlayerPlayFilled className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[15px]", t.text, cur && "font-semibold")}>{track?.title ?? "Nicht verfügbar"}</span>
                    <span className={cn("block truncate text-[12px]", t.muted)}>{track ? (id.startsWith("pc:") ? track.description || "PC" : track.zoneLabel) : "PC-Datei hier nicht erreichbar"}</span>
                  </span>
                </button>
                <button aria-label="Mehr" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", t.muted)} data-testid="music-track-menu" onClick={() => setMenu(menu === id ? null : id)} type="button">
                  {menu === id ? <IconX className="size-4" /> : <IconDots className="size-4" />}
                </button>
              </div>
              {menu === id ? (
                <TrackMenu
                  onDone={() => setMenu(null)}
                  playlist={playlist}
                  playlists={playlists}
                  t={t}
                  trackId={id}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {picker && playlist ? <SongPicker dark={dark} onClose={() => setPicker(false)} pcTracks={pcTracks} playlist={playlist} /> : null}
    </div>
  );
}

function TrackMenu({ trackId, playlist, playlists, onDone, t }: { trackId: string; playlist?: MusicPlaylist; playlists: MusicPlaylist[]; onDone: () => void; t: (typeof T)["dark"] }) {
  const others = playlists.filter((p) => p.id !== playlist?.id);
  const chip = cn("flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] active:scale-95", t.chip);
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1" data-testid="music-track-actions">
      <span className={cn("w-full text-[11px]", t.muted)}>{playlist ? "Verschieben / hinzufügen nach:" : "Zu Ordner hinzufügen:"}</span>
      {others.map((p) => (
        <span className="flex gap-1" key={p.id}>
          <button
            className={chip}
            onClick={() => {
              addToPlaylist(p.id, [trackId]);
              onDone();
            }}
            type="button"
          >
            <IconPlus className="size-3.5" /> {p.name}
          </button>
          {playlist ? (
            <button
              className={chip}
              onClick={() => {
                moveTrack(playlist.id, p.id, trackId);
                onDone();
              }}
              type="button"
            >
              → verschieben
            </button>
          ) : null}
        </span>
      ))}
      <button
        className={chip}
        onClick={() => {
          const n = window.prompt("Name des neuen Ordners", "Neuer Ordner");
          if (n?.trim()) createPlaylist(n, [trackId]);
          onDone();
        }}
        type="button"
      >
        <IconFolderPlus className="size-3.5" /> Neuer Ordner
      </button>
      {playlist ? (
        <button
          className={cn(chip, "text-red-400")}
          onClick={() => {
            removeFromPlaylist(playlist.id, trackId);
            onDone();
          }}
          type="button"
        >
          <IconTrash className="size-3.5" /> Aus Ordner entfernen
        </button>
      ) : null}
    </div>
  );
}

function SongPicker({ playlist, pcTracks, onClose, dark }: { playlist: MusicPlaylist; pcTracks: BrainFmTrack[]; onClose: () => void; dark: boolean }) {
  const t = dark ? T.dark : T.light;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const groups = useMemo(
    () => [{ name: "PC-Musik", tracks: pcTracks }, ...builtinFolders().map((z) => ({ name: z.name, tracks: z.tracks }))].filter((g) => g.tracks.length > 0),
    [pcTracks],
  );
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className={cn("fixed inset-0 z-[90] flex flex-col", t.overlay)} data-testid="music-picker" role="dialog">
      <div className={cn("flex items-center gap-2 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]", t.line)}>
        <button aria-label="Schließen" className={cn("flex size-9 items-center justify-center rounded-full border", t.chip)} onClick={onClose} type="button">
          <IconX className="size-4" />
        </button>
        <p className={cn("min-w-0 flex-1 truncate text-[16px] font-semibold", t.text)}>Zu „{playlist.name}“ hinzufügen</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {groups.map((g) => (
          <div className="mb-4" key={g.name}>
            <div className="mb-1 flex items-center justify-between">
              <p className={cn("text-[11px] font-medium uppercase tracking-[0.16em]", t.muted)}>{g.name}</p>
              <button
                className={cn("text-[12px]", t.muted)}
                onClick={() => setSel((p) => new Set([...p, ...g.tracks.map((x) => x.id)]))}
                type="button"
              >
                alle
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {g.tracks.map((tr) => {
                const inList = playlist.trackIds.includes(tr.id);
                const on = sel.has(tr.id) || inList;
                return (
                  <li key={tr.id}>
                    <button className={cn("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left disabled:opacity-50", t.row)} disabled={inList} onClick={() => toggle(tr.id)} type="button">
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border", on ? "border-emerald-400 bg-emerald-500 text-black" : t.line)}>{on ? <IconCheck className="size-4" /> : null}</span>
                      <span className={cn("min-w-0 flex-1 truncate text-[14px]", t.text)}>{tr.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className={cn("border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3", t.line)}>
        <button
          className="h-12 w-full rounded-2xl bg-emerald-500 text-[15px] font-semibold text-black disabled:opacity-40"
          data-testid="music-picker-add"
          disabled={sel.size === 0}
          onClick={() => {
            addToPlaylist(playlist.id, [...sel]);
            onClose();
          }}
          type="button"
        >
          {sel.size > 0 ? `${sel.size} hinzufügen` : "Songs auswählen"}
        </button>
      </div>
    </div>
  );
}
