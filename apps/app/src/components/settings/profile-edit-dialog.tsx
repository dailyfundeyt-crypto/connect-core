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

const MAX_AVATAR_BYTES = 900_000;

async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Image is too large (max about 900 KB).");
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the image."));
    };
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

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

  useEffect(() => {
    if (!open) return;
    setDraft(getLocalProfile());
    setError(null);
  }, [open]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Please enter a name.");
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
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save profile to the database.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Name and photo shown in the sidebar. Photo is stored in Postgres
            (Connect media), not only in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col items-center gap-4">
          <button
            className="group relative size-24 overflow-hidden rounded-full bg-muted ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => fileRef.current?.click()}
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
              Photo
            </span>
          </button>
          <input
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const avatarUrl = await fileToDataUrl(file);
                setDraft((prev) => ({ ...prev, avatarUrl }));
              } catch (thrown) {
                setError(
                  thrown instanceof Error
                    ? thrown.message
                    : "Could not use that image.",
                );
              } finally {
                setBusy(false);
              }
            }}
            ref={fileRef}
            type="file"
          />

          <label className="w-full space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Display name
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
              placeholder="Your name"
              value={draft.name === "Connect User" ? "" : draft.name}
            />
          </label>

          {draft.avatarUrl ? (
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() =>
                setDraft((prev) => {
                  const next = { ...prev };
                  delete next.avatarUrl;
                  return next;
                })
              }
              type="button"
            >
              Remove photo
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
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()} size="sm">
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
