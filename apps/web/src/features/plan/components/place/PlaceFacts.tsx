import StatusBadge from "../../../../components/StatusBadge";
import { CardFact as Fact, CardFacts } from "../../../../components/CardFacts";
import type { AirportPlace } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";
import { airspaceWords, patternWords } from "./factWords";

/**
 * The airport card's facts in a row at the head of its Info tab, a
 * sideways scroller as Apple Maps' place card's (the owner, 2026-11-14:
 * "How can we make our airport card more similar to this?"; C1 on the
 * canvas V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"). Five,
 * always all five in this order, a dash where one is not known, so the
 * row never changes shape (the owner the same day: "the info strip can
 * have these fixed things: weather, airspace, elevation, pattern altitude
 * and distance"):
 *  - Weather: the flight category (the planner's from the report, AIM
 *    7-1-7), its own or, marked "≈", the model's or a near station's.
 *  - Airspace: the class at the field's surface, the engine's
 *    (surface_airspace, 14 CFR 71), part-time with its other times
 *    (factWords airspaceWords).
 *  - Elevation: NASR's field elevation, feet MSL.
 *  - Pattern: the traffic pattern altitude, NASR's TPA or AIM 4-3-3's
 *    recommendation marked as such (factWords patternWords).
 *  - Distance: from the pilot, else from the route's departure, the
 *    engine's great circle (useAway).
 * The wind, the longest runway and the fuel are the Weather and Runways
 * tabs' and the Info tab's services.
 */
export function PlaceFacts({
  place,
  category,
  approximate,
  away,
}: {
  place: AirportPlace;
  /** The category the card shows, and whether it is not the field's own. */
  category: string | null;
  approximate: string | null;
  /** How far and which way, and from what ("you" for own ship's fix). */
  away: { words: string; from: string | null } | null;
}) {
  const airspace = airspaceWords(place.surface_airspace);
  const pattern = patternWords(place.pattern);
  return (
    <CardFacts testId="place-facts">
      <Fact label="Weather" testId="place-fact-weather">
        {category ? (
          <StatusBadge category={category} data-testid="place-fact-category">
            {approximate ? (
              <>
                <span aria-hidden>≈ {category}</span>
                <span className="sr-only">
                  About {category}, {approximate}
                </span>
              </>
            ) : undefined}
          </StatusBadge>
        ) : (
          "—"
        )}
      </Fact>
      <Fact label="Airspace" testId="place-fact-airspace" note={airspace.note}>
        {airspace.value}
      </Fact>
      <Fact label="Elevation" testId="place-fact-elevation">
        {feet(place.elevation_ft)}
      </Fact>
      <Fact label="Pattern" testId="place-fact-pattern" note={pattern.note}>
        {pattern.value}
      </Fact>
      <Fact label={away?.from ? `From ${away.from}` : "Distance"} testId="place-fact-distance">
        {away?.words ?? "—"}
      </Fact>
    </CardFacts>
  );
}
