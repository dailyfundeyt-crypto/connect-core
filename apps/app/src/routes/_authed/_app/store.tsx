import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/store/store-page";
import { StoreHome } from "@/v06/store/StoreHome";
import { getFlag } from "@/contracts/v06/flags";

/**
 * Store Route (v06 / Lane 8)
 * Play-Store-Design for MCPs, Tools/Apps, Skills, and Companys.
 * Gated by Feature-Flag FLAGS_V06.storeV1
 */
export const Route = (createFileRoute as any)("/_authed/_app/store")({
  component: StoreRoute,
});

function StoreRoute() {
  const isV06 = getFlag("storeV1");
  if (isV06) {
    return <StoreHome />;
  }
  return <StorePage />;
}

export default StoreRoute;

