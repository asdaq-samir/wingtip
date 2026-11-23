import AccordionSection from "../../components/AccordionSection";
import { aircraftKey, shortName } from "../../lib/aircraftChoice";
import { usePreferences } from "../../lib/preferences";
import { Suspense } from "react";
import { fromChunk } from "../../lib/fromChunk";
import { Spinner } from "../../components/ui/spinner";

/** The lists' page on a chunk of its own, fetched as the Brief draws its
 *  Checklists: in the route's panel it was among a route link's first
 *  scripts, 5 KB drawn only once the Brief is open (route-load.spec). */
const { Part: ChecklistPage } = fromChunk(
  () => import("../../components/ChecklistPage"),
  (m) => m.default,
);

/**
 * The Brief's Checklists: the flight's airplane's own, normal and
 * emergency, kept in this browser (lib/checklists) -- for any airplane
 * the plan flies, a stock profile or a tail as well as the pilot's own
 * (whose page in Setup's Airplanes opens the same lists).
 */
export default function FlightChecklists() {
  const aircraft = usePreferences((s) => s.aircraft);
  return (
    <AccordionSection title="Checklists">
      <Suspense fallback={<Spinner className="mx-auto" />}>
        <ChecklistPage key={aircraftKey(aircraft)} airplane={aircraftKey(aircraft)} name={shortName(aircraft.label)} />
      </Suspense>
    </AccordionSection>
  );
}
