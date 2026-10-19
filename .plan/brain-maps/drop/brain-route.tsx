import { createFileRoute } from "@tanstack/react-router";
import { BrainMapsPage } from "@/components/brain/maps/brain-maps-page";

/** Brain (MAPS) als eigene Seite. `focus` = Datei, die markiert wird; `from` = Firma, in deren Editor "Oeffnen" springt. */
export const Route = createFileRoute("/_authed/_app/brain")({
  validateSearch: (search: Record<string, unknown>): { focus?: string; from?: string } => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: BrainRoute,
});

function BrainRoute() {
  const { focus, from } = Route.useSearch();
  return <BrainMapsPage focus={focus} from={from} />;
}
