/**
 * NFT ownership path for bots & companies (research notes).
 *
 * Connect is affiliate discovery only — no on-app invest/buy. Serials in
 * `store.ts` are NFT-shaped (`BOT-` / `CO-` / `NFT-`). When we mint later:
 *
 * 1. **Metaplex Core (Solana)** — low fees; map serial → asset name.
 * 2. **Crossmint** — custodial mint + email wallets for non-crypto buyers.
 * 3. **Helius / Candy Machine** — batch drops if we sell packs later.
 *
 * Redeem codes remain the access grant after off-app purchase. Mirks
 * (Pump.fun / Solana) are display-only live quotes, not NFTs and not
 * tradeable inside Connect.
 */

export const NFT_OWNERSHIP_NOTES = {
  serialPrefixes: ["BOT", "CO", "NFT"] as const,
  preferredStack: "metaplex-core" as const,
  custodyFallback: "crossmint" as const,
  accessStillVia: "redeem-code" as const,
  tradingOnConnect: false,
};
