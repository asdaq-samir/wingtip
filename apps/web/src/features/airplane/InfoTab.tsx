import type { ReactNode } from "react";
import type { AircraftRegistration } from "../../lib/api/types";
import AirplaneInfo from "./AirplaneInfo";
import type { useAirplaneCard } from "./useAirplaneCard";

/**
 * The airplane card's Info tab, for an N-number (AirplaneCard): its public
 * record and its identifiers (AirplaneInfo). Its photo is a slide of the card's top row
 * (FlightPictures), shown once. `faa` is the registry's record as the
 * flight's detail carries it, there before the N-number's own lookup
 * answers on a card opened from traffic. `poh` its POH row, here for an
 * airplane the planner cannot fly, which has no Figures.
 */
export default function InfoTab({
  card,
  faa,
  hex,
  callsign,
  poh,
}: {
  card: ReturnType<typeof useAirplaneCard>;
  faa: AircraftRegistration | null | undefined;
  hex: string | null;
  callsign: string | null;
  poh: ReactNode;
}) {
  const record = card.record ?? faa ?? null;
  return (
    <>
      <AirplaneInfo record={record} details={card.details} detailsFailed={card.detailsFailed} hex={hex} callsign={callsign} />
      {poh && <div className="pt-5">{poh}</div>}
    </>
  );
}
