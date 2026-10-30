/**
 * Connect Store Review Service (v06)
 * Lokale Admin-Freigabe (Stefan) fuer Store-Listings: 'review' -> 'published' / 'rejected'.
 */

import type { StoreListing } from "../../contracts/v06/store";
import { getStoreListingById, saveStoreListing, listStoreListings } from "./listings";

export interface ReviewResult {
  ok: boolean;
  listing?: StoreListing;
  error?: string;
}

/**
 * Genehmigt ein Store-Listing und schaltet es auf 'published'.
 */
export async function approveListing(
  listingId: string,
  reviewerId = "stefan",
  dbOverride?: any,
): Promise<ReviewResult> {
  const listing = await getStoreListingById(listingId, dbOverride);
  if (!listing) {
    return { ok: false, error: `Store listing with ID '${listingId}' not found.` };
  }

  listing.status = "published";
  await saveStoreListing(listing, dbOverride);

  return {
    ok: true,
    listing,
  };
}

/**
 * Weist ein Store-Listing ab und setzt den Status auf 'rejected'.
 */
export async function rejectListing(
  listingId: string,
  reason: string,
  reviewerId = "stefan",
  dbOverride?: any,
): Promise<ReviewResult> {
  const listing = await getStoreListingById(listingId, dbOverride);
  if (!listing) {
    return { ok: false, error: `Store listing with ID '${listingId}' not found.` };
  }

  listing.status = "rejected";
  await saveStoreListing(listing, dbOverride);

  return {
    ok: true,
    listing,
  };
}

/**
 * Liefert alle Listings, die sich aktuell in Prüfung ('review') befinden.
 */
export async function listPendingReviews(dbOverride?: any): Promise<StoreListing[]> {
  return listStoreListings({ status: "review", includeAllStatus: true }, dbOverride);
}
