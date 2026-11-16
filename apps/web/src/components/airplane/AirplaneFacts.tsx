import { CardFact, CardFacts } from "../CardFacts";
import type { AircraftRegistration, AirplaneDetails } from "../../lib/api/types";

/**
 * An airplane's facts in the sideways strip under its card's actions, as
 * the airport card has its own (PlaceFacts; the owner, 2026-11-14: "make
 * sure the airplane card looks similar to airport card"): the N-number's
 * card (AirplaneProfileSheet) and a tracked flight's (FlightCard). From
 * the FAA aircraft registry's record (wingtip.registry), its reference
 * model's figures over the record's own where the card has them, each only
 * where there is one:
 *  - Type: the registry's make and model, else the traffic's type.
 *  - Year: the year it was built.
 *  - Seats and Engines: the FAA's reference record (ACFTREF), else the
 *    registration's.
 *  - Registration: its status, in the destructive ink where it has lapsed.
 *  - Owner: who it is registered to, public data the FAA publishes (the
 *    owner, 2026-11-14: "For owner info though, it's public info"); "Not
 *    in the record" where the owner asked the FAA to withhold the name
 *    (49 U.S.C. 44114(b)). Capped to a width, the whole of it in Info.
 */
export function AirplaneFacts({
  record,
  model,
  type,
  year,
  testId,
}: {
  record: AircraftRegistration | null | undefined;
  model?: AirplaneDetails["model"];
  /** What it is where the registry has no record (the traffic's type). */
  type?: string | null;
  year?: string | number | null;
  /** The strip's; each fact's is this and its name, "airplane-facts-owner". */
  testId: string;
}) {
  const made = [record?.manufacturer, record?.model].filter(Boolean).join(" ") || type || null;
  const built = record?.year ?? year ?? null;
  const seats = model?.seats ?? record?.seats ?? null;
  const engines = model?.engines ?? record?.engines ?? null;
  const lapsed = record?.standing === "lapsed";
  // No strip where there is nothing to say: its room is the pictures'.
  if (!record && !made && (built == null || built === "")) return null;
  return (
    <CardFacts testId={testId}>
      {made && (
        <CardFact label="Type" testId={`${testId}-type`}>
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
      {record?.status && (
        <CardFact label="Registration" testId={`${testId}-status`} className={lapsed ? "text-destructive-ink" : undefined}>
          {record.status}
        </CardFact>
      )}
      {record && (
        <CardFact label="Owner" testId={`${testId}-owner`} className="max-w-56 truncate">
          {record.owner ?? "Not in the record"}
        </CardFact>
      )}
    </CardFacts>
  );
}
