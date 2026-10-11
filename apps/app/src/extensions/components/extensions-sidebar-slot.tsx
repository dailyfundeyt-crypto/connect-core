import { useExtensionEnabled } from "@/extensions/context";
import { SparkNotesNav } from "@/extensions/spark/components/spark-notes-nav";

/**
 * Erweiterungs-Slot in der App-Sidebar.
 *
 * Steht zwischen „Gruppen" und „Agents". Rendert pro aktiver Erweiterung
 * ihren eigenen Nav-Baustein; inaktive Erweiterungen rendern nichts (`null`).
 *
 * WENN SIE ABGESCHALTET IST, VERSCHWINDET SIE HIER — das ist der Punkt des
 * Ganzes. Spark aus heißt: kein Plus-Knopf, keine Liste, keine Navigation in
 * den Editor. Der Editor selbst prüft dasselbe noch einmal in der Route
 * (`company/$companyId.tsx`), weil eine URL mit `?note=` den Schalter sonst
 * umgehen würde.
 *
 * `searching` kommt aus der globalen Channelsuche: während einer Suche
 * blendet die Sidebar ihre Listen aus, damit die Trefferliste nicht
 * konkurriert — die Notizenliste folgt derselben Regel.
 */
export function ExtensionsSidebarSlot({ searching }: { searching: boolean }) {
  const sparkEnabled = useExtensionEnabled("spark");

  return (
    <div className="order-[2.5] w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
      {sparkEnabled ? <SparkNotesNav searching={searching} /> : null}
    </div>
  );
}
