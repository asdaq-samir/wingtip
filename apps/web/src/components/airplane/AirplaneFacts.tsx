import { CardFact, CardFacts } from "../CardFacts";
import { shortType, shortWeight } from "./shortType";
import type { AircraftRegistration, AirplaneDetails } from "../../lib/api/types";

/**
 * An airplane's facts in the sideways strip under its card's actions, as
 * the airport card has its own (PlaceFacts; the owner, 2026-11-14: "make
 * sure the airplane card looks similar to airport card"): the N-number's
 * card (AirplaneCard's Info). From
 * the FAA aircraft registry's record (wingtip.registry), its reference
 * model's figures over the record's own where the card has them, each only
 * where there is one:
 *  - Make/Model: the registry's maker and model in a few words (shortType,
 *    "Airbus A321"), else the traffic's type.
 *  - Year: the year it was built.
 *  - Seats and Engines: the FAA's reference record (ACFTREF), else the
 *    registration's.
 *  Its registration's status and owner are its Registration section's,
 *  not the strip's (the owner, 2026-11-27: "Registration and owner can be
 *  removed from the strip").
 *  - Weight: the FAA's weight class for its model (ACFTREF's AC-WEIGHT,
 *    "Up to 12,499 lb"), written short ("≤12,499 lb").
 *  Spread across the card with no sideways scroll, as the airport card's
 *  are (`fit`; the owner, 2026-11-27: "keep the strip non-scrollable like
 *  airport card"), a fact with no room wrapping to a second row.
 *  - Operator: who flies it now, where adsb.lol's detail names one (an
 *    airline is often not the registered owner).
 *  - For traffic the FAA's registry does not hold, its own registration
 *    mark, ICAO address and call sign, the card having no record's
 *    sections (`traffic`). The strip took the place of the flight's "Now"
 *    section (the owner, 2026-11-27).
 */
export function AirplaneFacts({
  record,
  model,
  type,
  year,
  operator,
  traffic,
  testId,
}: {
  record: AircraftRegistration | null | undefined;
  model?: AirplaneDetails["model"];
  /** What it is where the registry has no record (the traffic's type). */
  type?: string | null;
  year?: string | number | null;
  operator?: string | null;
  /** Traffic the FAA's registry does not hold: its own identifiers. */
  traffic?: { mark: string | null; address: string; callsign: string | null } | null;
  /** The strip's; each fact's is this and its name, "airplane-facts-type". */
  testId: string;
}) {
  const made = shortType(record?.manufacturer, record?.model) ?? type ?? null;
  const built = record?.year ?? year ?? null;
  const seats = model?.seats ?? record?.seats ?? null;
  const engines = model?.engines ?? record?.engines ?? null;
  const weight = shortWeight(model?.weight_class);
  // No strip where there is nothing to say: its room is the pictures'.
  if (!record && !traffic && !made && (built == null || built === "")) return null;
  return (
    <CardFacts testId={testId} fit>
      {made && (
        <CardFact label="Make/Model" testId={`${testId}-type`}>
          {made}
        </CardFact>
      )}
      {built != null && built !== "" && (
        <CardFact label="Year" testId={`${testId}-year`}>
          {built}
        </CardFact>
      )}
      {seats != null && (
        <CardFact label="Seats" testId={`${testId}-seats`}>
          {seats}
        </CardFact>
      )}
      {engines != null && (
        <CardFact label="Engines" testId={`${testId}-engines`}>
          {engines}
        </CardFact>
      )}
      {traffic && (
        <CardFact label="Registration" testId={`${testId}-mark`}>
          {traffic.mark ?? "Not in the FAA's registry"}
        </CardFact>
      )}
      {weight && (
        <CardFact label="Weight" testId={`${testId}-weight`}>
          {weight}
        </CardFact>
      )}
      {operator && (
        <CardFact label="Operator" testId={`${testId}-operator`} className="max-w-56 truncate">
          {operator}
        </CardFact>
      )}
      {traffic && (
        <CardFact label="ICAO Address" testId={`${testId}-address`} className="uppercase">
          {traffic.address}
        </CardFact>
      )}
      {traffic?.callsign && (
        <CardFact label="Callsign" testId={`${testId}-callsign`}>
          {traffic.callsign}
        </CardFact>
      )}
    </CardFacts>
  );
}
