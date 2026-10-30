/**
 * T3-Bridge — Handy-Kopplung (Lane A34), öffentliche Fassade.
 *
 * Einstieg für A37 (Server-Verdrahtung) und für Tests:
 *   `createT3MobileRoutes({ authMiddleware })` → Mount auf `/api/t3/mobile`.
 *
 * Nichts hier enthält Klartext-Tokens; siehe `types.ts`.
 */

export {
  type CreateT3MobileRoutesOptions,
  createT3MobileRoutes,
  T3_MOBILE_ROUTES,
} from "./routes.js";
export {
  isLoopbackHostname,
  isSameOriginRequest,
  type MobileOriginInput,
  normalizeBaseUrl,
  resolveMobileBaseUrl,
} from "./secure.js";
export {
  createMobilePairingService,
  DEFAULT_MAX_ACTIVE_TICKETS,
  DEFAULT_MOBILE_PAIRING_TTL_MS,
  MobilePairingService,
  type MobilePairingServiceOptions,
} from "./service.js";

export {
  defaultMobileDeviceFile,
  FileMobileDeviceStore,
  MemoryMobileDeviceStore,
} from "./store.js";

export { buildPairUrl, hashToken, renderPairQrSvg } from "./tokens.js";

export type {
  MobileDevice,
  MobileDeviceRecord,
  MobileDeviceStore,
  MobilePairing,
  MobilePairingFailureReason,
  MobilePairingStartResult,
  MobilePairingStatus,
  MobilePairingTicket,
  MobileRedeemResult,
} from "./types.js";
