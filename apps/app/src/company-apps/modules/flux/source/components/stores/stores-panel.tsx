import { useState, type ChangeEvent } from "react";
import { StoreIcon, ImageUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@flux/components/ui/button";
import { Input } from "@flux/components/ui/input";
import { useAuth } from "@flux/lib/supabase/auth";
import { nextStoreId, uploadStoreLogo, type Store } from "@flux/lib/supabase/snapshot";
import { detectStoreSuggestion, platformLabel } from "@flux/lib/mcp/client";
import type { Platform } from "@flux/lib/mcp/stubs";

type StoresPanelProps = {
  stores: Store[];
  onStoresChange: (next: Store[]) => void;
};

const PLATFORMS: Platform[] = ["kleinanzeigen", "ebay", "etsy", "discogs", "amazon", "shopify", "other"];

export function StoresPanel({ stores, onStoresChange }: StoresPanelProps) {
  const auth = useAuth();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  return (
    <div className="space-y-3 px-3 py-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">Stores</p>
          <p className="text-[11px] text-neutral-500">VerkaufskanÃ¤le Â· Logos + KI-Erkennung pro Item.</p>
        </div>
        <Button type="button" size="sm" onClick={() => setEditingId("new")}>
          <Plus className="h-3.5 w-3.5" /> Neuer Store
        </Button>
      </header>

      {stores.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
          <StoreIcon className="mx-auto h-6 w-6 text-neutral-300" />
          <p className="mt-2 text-xs text-neutral-500">Noch keine Stores.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditingId("new")}>
            <Plus className="h-3.5 w-3.5" /> Ersten Store anlegen
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {stores.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-3 transition-colors hover:border-neutral-300"
            >
              {s.profileImageUrl ? (
                <img src={s.profileImageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 text-base font-semibold text-white">
                  {s.emoji || s.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{s.name}</p>
                <p className="truncate text-[10px] text-neutral-500">{s.platform ? platformLabel(s.platform) : "Plattform fehlt"}{s.description ? " Â· " + s.description.slice(0, 60) : ""}</p>
                {s.aiStoreSuggestion && (
                  <p className="mt-0.5 truncate text-[10px] text-violet-600">AI: {s.aiStoreSuggestion}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditingId(s.id)}>Bearbeiten</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Store â€ž${s.name}" lÃ¶schen?`)) onStoresChange(stores.filter((x) => x.id !== s.id));
                  }}
                  aria-label="Store lÃ¶schen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId !== null && (
        <StoreFormModal
          store={editingId === "new" ? null : stores.find((s) => s.id === editingId) ?? null}
          onClose={() => setEditingId(null)}
          onSaved={(store) => {
            const exists = stores.find((s) => s.id === store.id);
            if (exists) onStoresChange(stores.map((s) => (s.id === store.id ? store : s)));
            else onStoresChange([store, ...stores]);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

type StoreFormProps = {
  store: Store | null;
  onClose: () => void;
  onSaved: (s: Store) => void;
};

function StoreFormModal({ store, onClose, onSaved }: StoreFormProps) {
  const auth = useAuth();
  const [name, setName] = useState(store?.name ?? "");
  const [platform, setPlatform] = useState<Platform | "">(store?.platform ?? "");
  const [description, setDescription] = useState(store?.description ?? "");
  const [emoji, setEmoji] = useState(store?.emoji ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(store?.profileImageUrl ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(store?.aiStoreSuggestion ?? null);
  const [saving, setSaving] = useState(false);

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !auth.client || auth.status.kind !== "signed_in") return;
    setUploading(true);
    setUploadError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const storeId = store?.id ?? nextStoreId([]);
      const url = await uploadStoreLogo(auth.client, auth.status.user.id, storeId, file, ext);
      setProfileImageUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const handleAISuggest = async () => {
    if (!name.trim()) return;
    const suggestions = await detectStoreSuggestion({
      itemTitle: name,
      itemDescription: description,
      knownStores: [],
    });
    setAiHint(suggestions[0]?.reason ?? null);
  };

  const handleSave = async () => {
    setSaving(true);
    const saved: Store = {
      id: store?.id ?? 0, // 0 = server zuweist
      name: name.trim(),
      platform: platform === "" ? "" : platform,
      description: description.trim(),
      profileImageUrl,
      emoji: emoji.slice(0, 2),
      aiStoreSuggestion: aiHint,
      affiliateLinks: store?.affiliateLinks ?? {},
    };
    try {
      // FÃ¼rs erste: lokale ID-Vergabe wenn 0 (Server vergibt normalerweise via identity).
      const out = saved.id === 0 ? { ...saved, id: nextStoreId([]) } : saved;
      onSaved(out);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4">
      <div className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">{store ? "Store bearbeiten" : "Neuer Store"}</h3>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="SchlieÃŸen">Ã—</button>
        </header>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 text-base font-semibold text-white">
                {emoji || (name.slice(0, 1) || "?").toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">Logo</p>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-50">
                <ImageUp className="h-3.5 w-3.5" />
                <span>{uploading ? "LÃ¤dt hoch â€¦" : "Bild auswÃ¤hlen"}</span>
                <input type="file" accept="image/*" onChange={handleImage} className="hidden" disabled={uploading} />
              </label>
              {uploadError && <p className="mt-1 text-[10px] text-rose-600">{uploadError}</p>}
            </div>
          </div>

          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">Name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Mein eBay-Shop" required />
          </label>

          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">Plattform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform | "")}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
            >
              <option value="">â€” wÃ¤hlen â€”</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">Emoji (Fallback)</span>
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="ðŸ›ï¸" maxLength={2} />
          </label>

          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">Kurzbeschreibung</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was wird hier verkauft?"
              className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
              rows={2}
            />
          </label>

          <div className="rounded-md bg-violet-50 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-violet-700">AI-Vorschlag</p>
            <p className="mt-0.5 text-[11px] text-violet-800">{aiHint ?? "Noch nicht ermittelt."}</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-[10px]" onClick={() => void handleAISuggest()}>
              <Sparkles className="h-3 w-3" /> Erkennung starten
            </Button>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={() => void handleSave()}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichern â€¦</> : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
