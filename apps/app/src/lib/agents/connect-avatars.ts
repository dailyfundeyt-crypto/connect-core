/**
 * Connect bot profile images.
 *
 * Defaults live under /bots/*.png. Users can upload a replacement in the Bot dialog;
 * overrides are stored in localStorage (browser-only) keyed by agent id.
 *
 * Any Bot without a custom upload and without a named Connect packshot falls back
 * to `/bots/default.png` (the standard Connect Bot robot).
 */

export const CONNECT_BOT_FALLBACK_AVATAR = "/bots/default.png";

export const CONNECT_DEFAULT_AVATARS: Record<string, string> = {
  cto: "/bots/cto.png",
  analysis: "/bots/analysis.png",
  connect: "/bots/connect.png",
  consensus: "/bots/consensus.png",
  flux: "/bots/flux.png",
  hyper: "/bots/hyper.png",
  spark: "/bots/spark.png",
};

/** Hard ceiling for picked company/bot images (bytes). */
export const MAX_CONNECT_IMAGE_BYTES = 32 * 1024 * 1024;

/**
 * Longest edge kept after decode. 4K is enough for crisp banners/logos on retina
 * without blowing past localStorage quotas.
 */
const MAX_EDGE_PX = 4096;

const STORAGE_KEY = "connect.avatar.overrides";

function readOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeOverrides(next: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("connect-avatars-changed"));
  void import("@/lib/companies/workspace-sync").then((m) =>
    m.scheduleConnectWorkspacePush(),
  );
}

/** Resolve the image URL for a Bot: custom upload, named packshot, else standard robot. */
export function resolveBotAvatarUrl(agentId: string): string {
  const overrides = readOverrides();
  if (overrides[agentId]) return overrides[agentId];
  return CONNECT_DEFAULT_AVATARS[agentId] ?? CONNECT_BOT_FALLBACK_AVATAR;
}

/** Persist a data-URL (or http path) as the avatar for this Bot. */
export function setBotAvatarOverride(agentId: string, dataUrl: string) {
  const next = readOverrides();
  next[agentId] = dataUrl;
  writeOverrides(next);
}

/** Clear a custom upload and fall back to the Connect default (if any). */
export function clearBotAvatarOverride(agentId: string) {
  const next = readOverrides();
  delete next[agentId];
  writeOverrides(next);
}

export function hasBotAvatarOverride(agentId: string): boolean {
  return Boolean(readOverrides()[agentId]);
}

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
}

/**
 * Decode at full fidelity and re-encode for storage.
 * Keeps up to 4K on the long edge; PNG when alpha is likely, else high-quality JPEG.
 */
async function encodeHighQualityDataUrl(file: File): Promise<string> {
  const bitmap = await loadImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
    if (!ctx) throw new Error("Could not prepare that image.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const keepAlpha =
      file.type === "image/png" ||
      file.type === "image/webp" ||
      file.type === "image/gif" ||
      file.type === "image/svg+xml";

    if (keepAlpha) {
      return canvas.toDataURL("image/png");
    }
    return canvas.toDataURL("image/jpeg", 0.95);
  } finally {
    bitmap.close();
  }
}

/**
 * Read a picked image as a high-quality data URL for logos/banners.
 * Accepts files up to 32 MB; re-encodes at up to 4K for crisp display.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_CONNECT_IMAGE_BYTES) {
    throw new Error("Image must be under 32 MB.");
  }

  try {
    return await encodeHighQualityDataUrl(file);
  } catch {
    // Fallback: raw FileReader if createImageBitmap/canvas is unavailable.
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Could not read that image."));
          return;
        }
        resolve(result);
      };
      reader.readAsDataURL(file);
    });
  }
}
