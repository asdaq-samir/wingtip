import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import type { AircraftRegistration } from "../../lib/api/types";
import AirplaneInfo from "./AirplaneInfo";
import type { useAirplaneCard } from "./useAirplaneCard";

/**
 * The airplane card's Info tab, for an N-number (AirplaneCard): its facts
 * in a sideways strip (AirplaneFacts), then its public record and its
 * identifiers (AirplaneInfo). Its photo is a slide of the card's top row
 * (FlightPictures), shown once. `faa` is the registry's record as the
 * flight's detail carries it, there before the N-number's own lookup
 * answers on a card opened from traffic.
 */
export default function InfoTab({
  card,
  faa,
  hex,
  callsign,
}: {
  card: ReturnType<typeof useAirplaneCard>;
  faa: AircraftRegistration | null | undefined;
  hex: string | null;
  callsign: string | null;
}) {
  const record = card.record ?? faa ?? null;
  return (
    <>
      <AirplaneFacts record={card.details?.registration ?? record} model={card.details?.model} testId="airplane-facts" />
      <AirplaneInfo record={record} details={card.details} detailsFailed={card.detailsFailed} hex={hex} callsign={callsign} />
    </>
  );
}
