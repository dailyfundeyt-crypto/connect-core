/**
 * Profilfoto vorbereiten (nur im Browser): große Bilder (bis 20 MB, JPG/PNG/WebP/GIF/AVIF, HEIC sofern der
 * Browser es dekodieren kann) werden EXIF-korrekt gedreht, mittig quadratisch zugeschnitten, auf 512×512
 * verkleinert und als WebP (Fallback JPEG) mit Qualität ~0,85 kodiert. Ergebnis: wenige 10 KB, weit unter
 * dem Server-Limit von /api/connect/media.
 */
export const MAX_AVATAR_INPUT_BYTES = 20 * 1024 * 1024;
export const AVATAR_SIZE = 512;
/** Ziel für das fertige Bild (Data-URL-Länge); wird bei Bedarf über geringere Qualität erreicht. */
const MAX_OUTPUT_CHARS = 1_400_000;

export type PreparedAvatar = {
  dataUrl: string;
  width: number;
  height: number;
  /** Ungefähre Größe des fertigen Bildes in Bytes. */
  bytes: number;
  mime: string;
  sourceBytes: number;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|jfif|tiff?)$/i;

export function formatKb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap mit imageOrientation "from-image" wendet die EXIF-Ausrichtung an.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* Fallback: <img> (Chromium/Firefox/Safari drehen per CSS image-orientation: from-image) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      isHeic(file)
        ? "Dieses HEIC-Foto kann der Browser nicht öffnen. Bitte als JPG oder PNG speichern (z. B. in der Fotos-App „Exportieren“) und erneut wählen."
        : "Das Bild konnte nicht gelesen werden. Bitte ein JPG-, PNG- oder WebP-Bild wählen.",
    );
  }
}

function encode(canvas: HTMLCanvasElement): { dataUrl: string; mime: string } {
  for (const q of [0.85, 0.75, 0.65, 0.5]) {
    const webp = canvas.toDataURL("image/webp", q);
    if (webp.startsWith("data:image/webp")) {
      if (webp.length <= MAX_OUTPUT_CHARS) return { dataUrl: webp, mime: "image/webp" };
      continue;
    }
    // Kein WebP-Encoder (z. B. ältere Safari): JPEG
    const jpeg = canvas.toDataURL("image/jpeg", q);
    if (jpeg.length <= MAX_OUTPUT_CHARS || q === 0.5) return { dataUrl: jpeg, mime: "image/jpeg" };
  }
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.5), mime: "image/jpeg" };
}

export async function prepareAvatarImage(file: File): Promise<PreparedAvatar> {
  const looksLikeImage = file.type.startsWith("image/") || IMAGE_EXT.test(file.name);
  if (!looksLikeImage) {
    throw new Error("Bitte eine Bilddatei wählen (JPG, PNG, WebP oder HEIC).");
  }
  if (file.size === 0) throw new Error("Die Datei ist leer.");
  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    throw new Error(
      `Das Bild ist ${formatKb(file.size)} groß – erlaubt sind bis ${formatKb(MAX_AVATAR_INPUT_BYTES)}. Bitte ein kleineres Foto wählen.`,
    );
  }
  const decoded = await decode(file);
  try {
    const side = Math.min(decoded.width, decoded.height);
    if (!side) throw new Error("Das Bild konnte nicht gelesen werden.");
    const out = Math.min(AVATAR_SIZE, side);
    const sx = Math.floor((decoded.width - side) / 2);
    const sy = Math.floor((decoded.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Das Bild konnte nicht verarbeitet werden.");
    ctx.fillStyle = "#ffffff"; // transparente PNGs bei JPEG-Fallback nicht schwarz
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, sx, sy, side, side, 0, 0, out, out);
    const { dataUrl, mime } = encode(canvas);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { dataUrl, mime, width: out, height: out, bytes: Math.floor((base64.length * 3) / 4), sourceBytes: file.size };
  } finally {
    decoded.close();
  }
}

/** Server-/Netzwerkfehler beim Speichern verständlich auf Deutsch. */
export function friendlyAvatarSaveError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : String(caught ?? "");
  if (/too large|413|zu groß/i.test(raw)) {
    return "Das Foto ist zu groß für den Server. Bitte ein anderes Bild wählen – es wird automatisch verkleinert.";
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return "Keine Verbindung zum Connect-Server. Bitte prüfen, ob Connect läuft, und erneut speichern.";
  }
  if (/unauthor|401|403/i.test(raw)) return "Nicht angemeldet. Bitte neu anmelden und erneut speichern.";
  return raw && !/^Could not/i.test(raw) ? raw : "Das Profil konnte nicht in der Datenbank gespeichert werden.";
}
