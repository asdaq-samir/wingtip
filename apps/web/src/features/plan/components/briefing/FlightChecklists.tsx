import AccordionSection from "../../../../components/AccordionSection";
import { aircraftKey, shortName } from "../../../../lib/aircraftChoice";
import { usePreferences } from "../../../../lib/preferences";
import ChecklistPage from "../../../pilot/ChecklistPage";

/**
 * The Brief's Checklists: the flight's airplane's own, normal and
 * emergency, kept in this browser (lib/checklists) -- for any airplane
 * the plan flies, a stock profile or a tail as well as the pilot's own
 * (whose page in Setup's Airplanes opens the same lists).
 */
export default function FlightChecklists() {
  const aircraft = usePreferences(s => s.aircraft);
  return (
    <AccordionSection title="Checklists">
      <ChecklistPage key={aircraftKey(aircraft)} airplane={aircraftKey(aircraft)} name={shortName(aircraft.label)} />
    </AccordionSection>
  );
}
