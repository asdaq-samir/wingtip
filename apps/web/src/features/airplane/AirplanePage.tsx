import { memo, type ReactNode } from "react";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PastFlights from "../../components/airplane/PastFlights";
import AirplaneInfo from "./AirplaneInfo";
import type { AircraftRegistration } from "../../lib/api/types";
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
  return (
    <InfoBody
      tail={tail}
      record={card.record ?? live.detail?.faa ?? null}
      details={card.details}
      detailsFailed={card.detailsFailed}
      hex={hex}
      callsign={live.plane?.callsign?.trim() || null}
      poh={poh}
    />
  );
}

// Drawn again only when what it shows changes (memo): the card draws at
// each of the traffic's 5-second polls, which change nothing here.
const InfoBody = memo(function InfoBody({
  tail,
  record,
  details,
  detailsFailed,
  hex,
  callsign,
  poh,
}: {
  tail: string | null;
  record: AircraftRegistration | null;
  details: AirplaneSlices<"card">["card"]["details"];
  detailsFailed: boolean;
  hex: string | null;
  callsign: string | null;
  poh: ReactNode;
}) {
  return tail ? (
    <>
      <AirplaneInfo record={record} details={details} detailsFailed={detailsFailed} hex={hex} callsign={callsign} />
      {poh}
    </>
  ) : (
    <ListGroup title="Registration">
      <ListRow muted title="Not in the FAA's registry, so it has no public record here." />
    </ListGroup>
  );
});

/**
 * The airplane card's Flights tab: its flights, "Earlier" while it flies,
 * each ▶ its replay and debrief over this card (PastFlightCard), asked for
 * in the background as the card opens (useAirplaneCard), so they are in
 * when the tab is picked: OpenSky's take seconds (the owner, 2026-11-27).
 */
export function FlightsPage({ m }: { m: AirplaneSlices<"hex" | "live" | "nav"> }) {
  const { hex, live } = m;
  return <FlightsBody hex={hex} onOpen={m.nav.openPast} earlier={!!live.plane} type={live.detail?.type ?? live.plane?.type ?? null} />;
}

// As InfoBody: not drawn again at each poll.
const FlightsBody = memo(function FlightsBody({
  hex,
  onOpen,
  earlier,
  type,
}: {
  hex: string | null;
  onOpen: (id: number) => void;
  earlier: boolean;
  type: string | null;
}) {
  return hex ? (
    <PastFlights hex={hex} onOpen={onOpen} play title={earlier ? "Earlier" : "Flights"} type={type} />
  ) : (
    <ListGroup title="Flights">
      <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
    </ListGroup>
  );
});
