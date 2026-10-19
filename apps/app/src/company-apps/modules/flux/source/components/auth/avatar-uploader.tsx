import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import { uploadAvatar } from "@flux/lib/supabase/snapshot";
import type { useAuth } from "@flux/lib/supabase/auth";

type AvatarUploaderProps = {
  auth: ReturnType<typeof useAuth>;
  onUploaded: (url: string) => void;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function AvatarUploader({ auth, onUploaded }: AvatarUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [fileExt, setFileExt] = useState("png");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUrl = auth.status.kind === "signed_in" ? auth.status.profile?.avatar_url ?? null : null;
  const displayUrl = preview ?? currentUrl;

  useEffect(() => {
    setPreview(null);
  }, [auth.status.kind === "signed_in" ? auth.status.user.id : null]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bild-Datei wählen.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Datei zu groß (max. ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setFileBlob(file);
    setFileExt(file.name.split(".").pop()?.toLowerCase() || "png");
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!auth.client || !fileBlob) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadAvatar(auth.client, auth.status.kind === "signed_in" ? auth.status.user.id : "", fileBlob, fileExt);
      onUploaded(url);
      setFileBlob(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!auth.client) return;
    if (auth.status.kind !== "signed_in") return;
    setUploading(true);
    setError(null);
    try {
      onUploaded("");
      setFileBlob(null);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative h-16 w-16 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 ring-2 ring-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label="Profilbild hochladen"
      >
        {displayUrl ? (
          <img src={displayUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-base font-semibold text-white">
            {(auth.status.kind === "signed_in" ? (auth.status.user.email?.[0] ?? "U") : "U").toUpperCase()}
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-4 w-4" />
        </span>
      </button>

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {preview ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading}
            className="rounded bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {uploading ? "Lädt hoch…" : "Speichern"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setFileBlob(null);
            }}
            disabled={uploading}
            className="rounded px-2 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-[10px] font-medium text-neutral-500 hover:text-neutral-800"
        >
          Bild ändern
        </button>
      )}

      {currentUrl && !preview && (
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 hover:text-rose-600"
        >
          <Trash2 className="h-3 w-3" /> entfernen
        </button>
      )}

      {error && <p className="text-[10px] text-rose-600">{error}</p>}
    </div>
  );
}
