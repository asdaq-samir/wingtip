import { CardFact, CardFacts } from "../CardFacts";
import { shortMaker, shortWeight } from "./shortType";
import type { AircraftRegistration, AirplaneDetails } from "../../lib/api/types";

/**
 * An airplane's facts in the sideways strip under its card's actions, as
 * the airport card has its own (PlaceFacts; the owner, 2026-11-14: "make
 * sure the airplane card looks similar to airport card"): the N-number's
 * card (AirplaneCard's Info). From
 * the FAA aircraft registry's record (wingtip.registry), its reference
 * model's figures over the record's own where the card has them, each only
 * where there is one:
 *  - Make: the registry's maker alone ("Airbus", shortMaker), else the
 *    first word of traffic's own description; its model is the line
 *    under the title's.
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
 *  - For traffic the FAA's registry does not hold, its ICAO address, the
 *    card having no record's sections (`traffic`); its registration mark
 *    and call sign are the line under its title's. The strip took the place of the flight's "Now"
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
  traffic?: { address: string } | null;
  /** The strip's; each fact's is this and its name, "airplane-facts-make". */
  testId: string;
}) {
  // Its maker alone, the model being the line under its title's (the
  // owner, 2026-11-27: "maybe drop the Make/Model instead, just have the
  // make itself there"): the registry's, else the first word of traffic's
  // own description where it has more than one ("Airbus A-350-1000"), never
  // a bare type code.
  const words = type?.trim().split(/\s+/) ?? [];
  const make = shortMaker(record?.manufacturer) ?? (words.length > 1 ? words[0]! : null);
  const built = record?.year ?? year ?? null;
  const seats = model?.seats ?? record?.seats ?? null;
  const engines = model?.engines ?? record?.engines ?? null;
  const weight = shortWeight(model?.weight_class);
  // No strip where there is nothing to say: its room is the pictures'.
  if (!record && !traffic && !make && (built == null || built === "")) return null;
  return (
    <CardFacts testId={testId} fit>
      {make && (
        <CardFact label="Make" testId={`${testId}-make`}>
          {make}
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
      {/* Engines gives way to who flies it, five facts at the most as the
          airport card's (the Engine section says them). */}
      {engines != null && !operator && (
        <CardFact label="Engines" testId={`${testId}-engines`}>
          {engines}
        </CardFact>
      )}
      {weight && (
        <CardFact label="Weight" testId={`${testId}-weight`}>
          {weight}
        </CardFact>
      )}
      {operator && (
        <CardFact label="Operator" testId={`${testId}-operator`} className="line-clamp-2 max-w-28 whitespace-normal">
          {operator}
        </CardFact>
      )}
      {traffic && (
        <CardFact label="ICAO Address" testId={`${testId}-address`} className="uppercase">
          {traffic.address}
        </CardFact>
      )}
    </CardFacts>
  );
}
