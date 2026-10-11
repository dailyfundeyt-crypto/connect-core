/**
 * Spark-Notizen — Bilder einfügen.
 *
 * ## Warum Data-URL und nicht der Datei-Weg
 *
 * Der naheliegende Weg wäre die File System Access API: Ordner wählen, Bild
 * als echte Datei ablegen, `file://`-Pfad in die Notiz schreiben. Der
 * funktioniert in der Oberfläche nicht. Was `showDirectoryPicker` zurückgibt,
 * ist ein Handle auf einen Chromium-internen Sandbox-Pfad; die URL
 * `file:///2026-10-10-204501.png` ist außerhalb dieses Pfades nicht
 * auflösbar und liefert im `<img>` ein leeres Bild. Man bräuchte ein zweites
 * System: Handle in IndexedDB, bei jedem Laden Berechtigung erneut anfragen,
 * Datei zurücklesen, Blob-URL erzeugen. Das ist echte Arbeit und gehört in
 * eine eigene Phase.
 *
 * Stattdessen: Bild als Data-URL in die Notiz, vorher herunterskaliert. Damit
 * ist das Bild wirklich da — nach einem Neuladen, in einem Export, in einer
 * geteilten Notiz — und die Größe bleibt trotzdem in Griff, weil ein 4-MB-
 * Screenshot nach dem Skalieren rund 300 KB wiegt.
 */

/**
 * Obergrenze für ein eingebettetes Bild, in Bytes.
 *
 * localStorage ist typischerweise 5–10 MB pro Origin und **synkron**. Ein
 * einzelnes 20-MB-Bild würde nicht nur die Notiz sprengen, sondern den
 * Schreibvorgang blockieren. 1,5 MB pro Bild bei ~1,5 MB Notizen pro Gerät
 * lässt Luft für eine realistische Arbeitsmenge.
 */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

/** Kantenlänge, auf die ein Bild höchstens verkleinert wird. */
const MAX_IMAGE_EDGE = 1920;

/**
 * Bilder werden als JPEG gespeichert, außer sie sind unvermeidbar transparent
 * (PNG). Ein Screenshot als PNG ist oft 3× so groß wie dieselbe Aufnahme als
 * JPEG, und im Editor sieht man den Unterschied nicht.
 */
const JPEG_QUALITY = 0.82;

export type ImageInsertResult =
  | { status: "ok"; src: string; fileName: string; bytes: number }
  | { status: "too-large"; bytes: number }
  | { status: "failed"; message: string };

/**
 * Liest ein Bild ein, verkleinert es bei Bedarf und gibt eine Data-URL zurück.
 *
 * `URL.createObjectURL` + `Image` ist der Weg: die Datei wird nie in einen
 * `<canvas>`-Data-URL geschrieben, nur das skalierte Ergebnis.
 */
export async function imageFileToDataUrl(
  file: File,
): Promise<ImageInsertResult> {
  if (!file.type.startsWith("image/")) {
    return {
      status: "failed",
      message: "Das ist keine Bilddatei.",
    };
  }

  try {
    const src = await scaleIfNeeded(file);
    /*
     * Die Grenze prüfen wir NACH dem Skalieren. Ein 20-MB-Screenshot wird
     * darunter fallen, und jemand, der ein 40-MB-Foto einfügt, bekommt eine
     * konkrete Zahl statt eines stillen Abbruchs.
     */
    const bytes = dataUrlBytes(src);
    if (bytes > MAX_IMAGE_BYTES) {
      return { status: "too-large", bytes };
    }
    return { status: "ok", src, fileName: file.name, bytes };
  } catch {
    /*
     * Bewusst KEINE `error.message` durchreichen: Chromium liefert hier
     * englische Internals wie „The source image could not be decoded." Das ist
     * eine deutsche Oberfläche, und eine kaputte oder abgeschnittene Datei ist
     * für den Nutzer genau eine Sache — sie ist nicht lesbar. Was er tun kann,
     * steht im zweiten Satz.
     */
    return {
      status: "failed",
      message:
        "Bild konnte nicht gelesen werden. Möglicherweise ist die Datei beschädigt oder wurde beim Kopieren abgeschnitten — speichere sie neu und versuche es nochmal.",
    };
  }
}

/** Größe einer Data-URL in Bytes, ohne sie zu dekodieren. */
export function dataUrlBytes(dataUrl: string): number {
  const base64Length = dataUrl.length - dataUrl.indexOf(",") - 1;
  // 4 Base64-Zeichen == 3 Bytes, aufgerundet für den Fall der Füllzeichen.
  return Math.ceil((base64Length * 3) / 4);
}

/**
 * Verkleinert auf `MAX_IMAGE_EDGE` und kodiert neu. Images mittransparenz
 * bleiben PNG, weil JPEG kein Alpha kennt und der Hintergrund sonst schwarz
 * wird.
 */
async function scaleIfNeeded(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);

  const longestEdge = Math.max(bitmap.width, bitmap.height);
  const keepPng = file.type === "image/png" && (await hasAlpha(file));
  const scale =
    longestEdge > MAX_IMAGE_EDGE && !keepPng ? MAX_IMAGE_EDGE / longestEdge : 1;

  /*
   * Kein Skalieren nötig. Trotzdem über den Canvas-Pfad gehen, damit die
   * Ausgabe in beiden Fällen dasselbe Format hat und die Original-Datei
   * nicht als veralteter Blob in der Notiz steht.
   */
  if (scale >= 1) return encode(bitmap, keepPng);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    return encode(bitmap, keepPng);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  release(bitmap);
  return canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", JPEG_QUALITY);
}

function encode(source: ImageBitmap, usePng: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) {
    release(source);
    throw new Error("Canvas steht in diesem Browser nicht zur Verfügung.");
  }
  context.drawImage(source, 0, 0);
  release(source);
  return canvas.toDataURL(usePng ? "image/png" : "image/jpeg", JPEG_QUALITY);
}

/** Bild dekodieren. `createImageBitmap` ist schneller und skaliert selbst. */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      // Der `Image`-Fallback kann kein ImageBitmap liefern; wir nehmen die
      // Obertfläche, die beide Pfade gemeinsam haben.
      resolve(image as unknown as ImageBitmap);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht dekodiert werden."));
    };
    image.src = url;
  });
}

function release(bitmap: ImageBitmap): void {
  if (typeof bitmap.close === "function") bitmap.close();
}

/**
 * Hat das PNG einen Alphakanal?
 *
 * Nur der PNG-Header sagt das zuverlässig: im IHDR-Chunk steht der Farbtyp,
 * 6 bedeutet RGBA, 4 Graustufen mit Alpha. Alles andere wird JPEG.
 */
async function hasAlpha(file: File): Promise<boolean> {
  try {
    const header = await file.slice(0, 26).arrayBuffer();
    const bytes = new Uint8Array(header);
    if (bytes.length < 26) return false;
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    if (!isPng) return false;
    return bytes[25] === 6 || bytes[25] === 4;
  } catch {
    return false;
  }
}

/**
 * Ist in diesem Clipboard-Event ein Bild?
 *
 * Beim Einfügen liefert Chromium gemischte Typen; `types.includes("Files")`
 * ist zu grob, weil auch Text darüber läuft. Deshalb die Items direkt prüfen.
 */
export function findImageInClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Bild aus einer Datei-Auswahl (Drag & Drop oder `<input type="file">`). */
export function findImageInFileList(files: FileList | null): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
