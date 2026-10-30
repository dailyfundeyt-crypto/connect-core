/**
 * Handy-Kopplung (Lane A34) — öffentliche Fassade für A39.
 *
 * Einbau im Benutzer-Menü:
 *   const [open, setOpen] = useState(false);
 *   <DropdownMenuItem onClick={() => setOpen(true)}>Handy verbinden</DropdownMenuItem>
 *   <PhoneT3Dialog isOpen={open} onClose={() => setOpen(false)} />
 *
 * Flag aus (`connect.t3.bridge`) → das Panel rendert nichts (altes Verhalten).
 */

export {
  createPhoneT3Pairing,
  fetchPhoneT3Status,
  PhoneT3Error,
  revokePhoneT3Device,
} from "./client";
export {
  formatCountdown,
  formatTime,
  formatWhen,
  secondsUntil,
} from "./format";
export { PhoneT3Dialog, type PhoneT3DialogProps } from "./phone-t3-dialog";
export {
  PhoneT3PairingCard,
  type PhoneT3PairingCardProps,
} from "./phone-t3-pairing-card";
export { PhoneT3Panel, type PhoneT3PanelProps } from "./phone-t3-panel";
export type { PhoneT3Device, PhoneT3Pairing, PhoneT3Status } from "./types";
export {
  type UsePhoneT3Options,
  type UsePhoneT3Result,
  usePhoneT3,
} from "./use-phone-t3";
