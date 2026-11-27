import type { ReactNode } from "react";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PastFlights from "../../components/airplane/PastFlights";
import AirplaneInfo from "./AirplaneInfo";
import type { AirplaneSlices } from "./useAirplaneCardModel";

/**
 * The airplane card's Info tab, the one it opens on (the owner,
 * 2026-11-27: "let's have two tabs, info and flights. by default info
 * opens"): its public record for an N-number (AirplaneInfo: Registration,
 * Airplane, Engine, Airworthiness, its history), each section its first
 * three rows and its title the rest (FirstFew), then its POH's row for an
 * airplane with no Figures. Traffic the FAA's registry does not hold has no
 * record to show, said so.
 */
export function InfoPage({ m, poh }: { m: AirplaneSlices<"card" | "hex" | "live" | "tail">; poh: ReactNode }) {
  const { hex, tail, live, card } = m;
  return tail ? (
    <>
      <AirplaneInfo
        record={card.record ?? live.detail?.faa ?? null}
        details={card.details}
        detailsFailed={card.detailsFailed}
        hex={hex}
        callsign={live.plane?.callsign?.trim() || null}
      />
      {poh}
    </>
  ) : (
    <ListGroup title="Registration">
      <ListRow muted title="Not in the FAA's registry, so it has no public record here." />
    </ListGroup>
  );
}

/**
 * The airplane card's Flights tab: its flights, "Earlier" while it flies,
 * each ▶ its replay and debrief over this card (PastFlightCard), asked for
 * in the background as the card opens (useAirplaneCard), so they are in
 * when the tab is picked: OpenSky's take seconds (the owner, 2026-11-27).
 */
export function FlightsPage({ m }: { m: AirplaneSlices<"hex" | "live" | "nav"> }) {
  const { hex, live } = m;
  return hex ? (
    <PastFlights
      hex={hex}
      onOpen={m.nav.openPast}
      play
      title={live.plane ? "Earlier" : "Flights"}
      type={live.detail?.type ?? live.plane?.type ?? null}
    />
  ) : (
    <ListGroup title="Flights">
      <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
    </ListGroup>
  );
}
