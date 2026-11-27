import type { ReactNode } from "react";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PastFlights from "../../components/airplane/PastFlights";
import { FlightNowDetails } from "../traffic/lazy";
import AirplaneInfo from "./AirplaneInfo";
import type { AirplaneCardModel } from "./useAirplaneCardModel";

/**
 * The airplane card's one page under its pictures, with no tab bar (the
 * owner, 2026-11-26: "Merge the info and flights tab, we don't need a tab
 * bar"), each section its first three rows and its title the rest, as the
 * airport card's are (FirstFew): while it flies "Now" (its squawk,
 * operator, scheduled route and the tower's departure event); then its
 * public record for an N-number (AirplaneInfo: Registration, Airplane,
 * Engine, Airworthiness, its history), its POH's row after it for an
 * airplane with no Figures; then its flights, "Earlier" while it flies,
 * each ▶ its replay and debrief over this card (PastFlightCard). Traffic
 * the FAA's registry does not hold has its identifiers in the first
 * section, "Details" on the ground. Its Figures are a card of their own
 * (FiguresCard).
 */
export default function AirplanePage({ m, poh }: { m: AirplaneCardModel; poh: ReactNode }) {
  const { hex, tail, live, card } = m;
  const now = !!hex && (!!live.plane || !tail);
  return (
    <div className="space-y-5 pt-5" data-testid="airplane-page">
      {now && <FlightNowDetails hex={hex} live={live} registry={!tail} />}
      {tail && (
        <AirplaneInfo
          record={card.record ?? live.detail?.faa ?? null}
          details={card.details}
          detailsFailed={card.detailsFailed}
          hex={hex}
          callsign={live.plane?.callsign?.trim() || null}
        />
      )}
      {poh}
      {hex ? (
        <PastFlights
          hex={hex}
          onOpen={m.openPast}
          play
          title={live.plane ? "Earlier" : "Flights"}
          type={live.detail?.type ?? live.plane?.type ?? null}
        />
      ) : (
        <ListGroup title="Flights">
          <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
        </ListGroup>
      )}
    </div>
  );
}
