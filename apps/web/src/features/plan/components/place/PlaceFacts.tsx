import StatusBadge from "../../../../components/StatusBadge";
import { CardFact as Fact, CardFacts } from "../../../../components/CardFacts";
import type { AirportPlace } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";
import type { SurfaceHours } from "./surfaceHoursWords";
import { airspaceWords, distanceWords, patternWords } from "./factWords";

/**
 * The airport card's facts in a row at the head of its Info tab, as Apple
 * Maps' place card's (C1 on the canvas V1d9RDbmY1aczc4LfXed7a). Five,
 * always all five in this order, a dash where one is not known, so the
 * row never changes shape (the owner, 2026-11-14: "the info strip can
 * have these fixed things: weather, airspace, elevation, pattern altitude
 * and distance"), short so the five fit across an iPhone with no
 * sideways scroll ("keep the info strip compact enough so pilot doesn't
 * have to scroll"), at most one note:
 *  - Weather: the flight category (the planner's from the report, AIM
 *    7-1-7), its own or, marked "≈", the model's or a near station's.
 *  - Airspace: the class at the field's surface now, "D", the engine's
 *    (surface_airspace, 14 CFR 71), part-time with the day's next change,
 *    "G after 22:00" (surface_hours, factWords airspaceWords); a tap opens
 *    the Info tab's Airspace hours, as Maps' Hours fact does.
 *  - Elev.: NASR's field elevation, feet MSL.
 *  - Pattern: the traffic pattern altitude, NASR's TPA or AIM 4-3-3a's
 *    (factWords patternWords; the Runways tab says which).
 *  - Distance: from the pilot, else from the route's departure, the
 *    engine's great circle, its figure alone ("12 nm").
 */
export function PlaceFacts({
  place,
  category,
  approximate,
  away,
  hours,
  onAirspace,
}: {
  place: AirportPlace;
  /** The category the card shows, and whether it is not the field's own. */
  category: string | null;
  approximate: string | null;
  /** How far and which way, and from what ("you" for own ship's fix). */
  away: { words: string; from: string | null } | null;
  /** The part-time surface area's hours now (surfaceHoursWords), where it has them. */
  hours: SurfaceHours | null;
  /** The Airspace fact tapped: its hours opened, where it is part-time. */
  onAirspace?: () => void;
}) {
  const airspace = airspaceWords(place.surface_airspace, hours);
  return (
    <CardFacts testId="place-facts" fit>
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
      <Fact
        label="Airspace"
        testId="place-fact-airspace"
        note={airspace.note}
        onPick={place.surface_airspace?.part_time ? onAirspace : undefined}
      >
        {airspace.value}
      </Fact>
      <Fact label="Elev." testId="place-fact-elevation">
        {feet(place.elevation_ft)}
      </Fact>
      <Fact label="Pattern" testId="place-fact-pattern">
        {patternWords(place.pattern).value}
      </Fact>
      <Fact label={away?.from ? `From ${away.from}` : "Distance"} testId="place-fact-distance">
        {distanceWords(away?.words)}
      </Fact>
    </CardFacts>
  );
}
