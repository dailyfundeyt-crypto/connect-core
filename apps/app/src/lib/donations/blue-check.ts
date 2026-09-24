/**
 * Blue Check (blauer Haken) — earned by donating to Connect.
 * Shows “this is a human / supporter” and boosts Marketplace visibility +20%.
 * Payment stays on Stripe (or another provider); we only record the badge.
 */

const KEY = "connect.donations.blue-check";
const EVENT = "connect-donations-changed";

/** Default Stripe Payment Link — replace with your real donate link. */
export const DEFAULT_DONATE_URL =
  "https://buy.stripe.com/test_donate_connect";

export const MARKETPLACE_DONOR_BOOST = 1.2;

export type BlueCheckState = {
  active: boolean;
  donatedAt?: string;
  /** Last amount label, display-only */
  amountLabel?: string;
  provider: "stripe" | "other";
  /** Override checkout URL (seller-style affiliate: we send traffic to Stripe) */
  donateUrl?: string;
};

function read(): BlueCheckState {
  if (typeof window === "undefined") {
    return { active: false, provider: "stripe" };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { active: false, provider: "stripe" };
    return { active: false, provider: "stripe", ...JSON.parse(raw) };
  } catch {
    return { active: false, provider: "stripe" };
  }
}

function write(state: BlueCheckState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
  void import("@/lib/companies/workspace-sync").then((m) =>
    m.scheduleConnectWorkspacePush(),
  );
}

export function getBlueCheck(): BlueCheckState {
  return read();
}

export function hasBlueCheck(): boolean {
  return read().active === true;
}

export function getDonateUrl(): string {
  return read().donateUrl?.trim() || DEFAULT_DONATE_URL;
}

export function subscribeBlueCheck(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Open Stripe (or other) donate page — Connect never takes the payment. */
export function openDonateCheckout(): void {
  const url = getDonateUrl();
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * After the donor returns from Stripe, activate the blue check.
 * (No webhook in local mode — user confirms, or Stripe success URL can deep-link later.)
 */
export function activateBlueCheck(input?: {
  amountLabel?: string;
  provider?: "stripe" | "other";
}): BlueCheckState {
  const next: BlueCheckState = {
    ...read(),
    active: true,
    donatedAt: new Date().toISOString(),
    amountLabel: input?.amountLabel ?? "Spende",
    provider: input?.provider ?? "stripe",
  };
  write(next);
  return next;
}

export function revokeBlueCheck(): BlueCheckState {
  const next: BlueCheckState = {
    ...read(),
    active: false,
    donatedAt: undefined,
    amountLabel: undefined,
  };
  write(next);
  return next;
}

export function setDonateUrl(url: string): BlueCheckState {
  const next = { ...read(), donateUrl: url.trim() || undefined };
  write(next);
  return next;
}

/** Sort key: donors float higher (+20% visibility weight). */
export function marketplaceBoostScore(isDonor: boolean, base = 1): number {
  return isDonor ? base * MARKETPLACE_DONOR_BOOST : base;
}
