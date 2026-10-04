import { IconCamera, IconUser } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getLocalProfile,
  setLocalProfile,
  type LocalProfile,
} from "@/lib/auth/local-profile";
import {
  formatKb,
  friendlyAvatarSaveError,
  prepareAvatarImage,
  type PreparedAvatar,
} from "@/lib/auth/avatar-image";

/**
 * Edit display name + profile photo for the sidebar user button.
 */
export function ProfileEditDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<LocalProfile>(() => getLocalProfile());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Neu gewähltes, bereits angepasstes Foto (Vorschau bis "Speichern"). */
  const [prepared, setPrepared] = useState<PreparedAvatar | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(getLocalProfile());
    setError(null);
    setPrepared(null);
  }, [open]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Bitte einen Namen eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setLocalProfile({
        name,
        avatarUrl: draft.avatarUrl ?? null,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(friendlyAvatarSaveError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm" closeLabel="Schließen">
        <DialogHeader>
          <DialogTitle>Dein Profil</DialogTitle>
          <DialogDescription>
            Name und Foto für die Seitenleiste. Das Foto wird in der
            Connect-Datenbank gespeichert, nicht nur in diesem Browser.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col items-center gap-4">
          <button
            className="group relative size-24 overflow-hidden rounded-full bg-muted ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Foto wählen"
            onClick={() => fileRef.current?.click()}
            title="Foto wählen (große Bilder werden automatisch verkleinert)"
            type="button"
          >
            {draft.avatarUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                src={draft.avatarUrl}
              />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <IconUser className="size-10" />
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <IconCamera className="size-3" />
              Foto
            </span>
          </button>
          <input
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const result = await prepareAvatarImage(file);
                setPrepared(result);
                setDraft((prev) => ({ ...prev, avatarUrl: result.dataUrl }));
              } catch (thrown) {
                setError(
                  thrown instanceof Error
                    ? thrown.message
                    : "Dieses Bild kann nicht verwendet werden.",
                );
              } finally {
                setBusy(false);
              }
            }}
            ref={fileRef}
            type="file"
          />

          {prepared ? (
            <p
              className="-mt-2 text-center text-xs text-muted-foreground"
              data-testid="avatar-prepared-info"
            >
              Vorschau: zugeschnitten auf {prepared.width}×{prepared.height} px,{" "}
              {formatKb(prepared.sourceBytes)} → {formatKb(prepared.bytes)}.
              <br />
              Wird mit „Speichern“ übernommen.
            </p>
          ) : (
            <p className="-mt-2 text-center text-xs text-muted-foreground">
              Auf das Bild klicken, um ein Foto zu wählen (bis 20 MB, wird
              automatisch angepasst).
            </p>
          )}

          <label className="w-full space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Anzeigename
            </span>
            <input
              autoFocus
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void save();
                }
              }}
              placeholder="Dein Name"
              value={draft.name === "Connect User" ? "" : draft.name}
            />
          </label>

          {draft.avatarUrl ? (
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setPrepared(null);
                setDraft((prev) => {
                  const next = { ...prev };
                  delete next.avatarUrl;
                  return next;
                });
              }}
              type="button"
            >
              Foto entfernen
            </button>
          ) : null}

          {error ? (
            <p className="w-full text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-6">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="outline"
          >
            Abbrechen
          </Button>
          <Button disabled={busy} onClick={() => void save()} size="sm">
            {busy ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
