import { ListGroup, ListRow } from "../../components/GroupedList";
import PastFlights from "../../components/airplane/PastFlights";
import { FlightNowDetails } from "../traffic/lazy";
import type { AirplaneCardModel } from "./useAirplaneCardModel";

/**
 * The airplane card's Flights tab, its flight now and its earlier ones in
 * one (the owner's word, 2026-11-26, where they were the tabs Flight and
 * Flights): while it flies a short "Now" group first (its squawk,
 * operator, scheduled route and the tower's departure event), then
 * "Earlier", its past flights newest first, each ▶ its replay and debrief
 * over this card (PastFlightCard); on the ground the list alone. Traffic
 * the FAA's registry does not hold keeps its identifiers in that group
 * too, its card having no Info.
 */
export default function FlightsTab({ m }: { m: AirplaneCardModel }) {
  const { hex, tail, live } = m;
  if (!hex)
    return (
      <ListGroup>
        <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
      </ListGroup>
    );
  const now = !!live.plane || !tail;
  return (
    <div className="space-y-5">
      {now && <FlightNowDetails hex={hex} live={live} registry={!tail} />}
      <PastFlights
        hex={hex}
        onOpen={m.openPast}
        play
        title={live.plane ? "Earlier" : now ? "Flights" : undefined}
        type={live.detail?.type ?? live.plane?.type ?? null}
      />
    </div>
  );
}
