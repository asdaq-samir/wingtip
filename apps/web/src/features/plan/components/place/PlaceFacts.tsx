import { useQuery } from "@tanstack/react-query";
import StatusBadge from "../../../../components/StatusBadge";
import { CardFact as Fact, CardFacts } from "../../../../components/CardFacts";
import type { AirportPlace } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";
import { servicesQuery } from "../../../../lib/queryClient";
import { fuelNames } from "../../../../lib/stopServices";
import { useNotamMarks } from "./notamBadges";
import { placeWind } from "./placeWind";
import { longestOpen } from "./runwayPicks";

/**
 * The airport card's facts in a row under its actions, a sideways scroller
 * as Apple Maps' place card's (the owner, 2026-11-14: "How can we make our
 * airport card more similar to this?"; C1 on the canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"). It takes the
 * place of T4's one-line report under the tabs. Each where the card's
 * data has it, in this order:
 *  - Weather: the flight category (the planner's from the report, AIM
 *    7-1-7), its own or, marked "≈", the model's or a near station's.
 *  - Wind: the report's, true, as METAR winds are (FAA JO 7900.5).
 *  - Longest: the longest runway open, closed ones (NASR's or a NOTAM's)
 *    left out, as the Runways tab badges it; "Runway" where there is one.
 *  - Elevation: NASR's field elevation, feet MSL.
 *  - Distance: from the pilot, else from the route's departure, the
 *    engine's great circle (useAway).
 *  - Fuel: NASR's fuel types for sale (the services' answer, the engine's
 *    fuel_names).
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
  const marks = useNotamMarks(place.ident, place);
  const { data: services } = useQuery(servicesQuery(place.ident));
  const runways = place.runways.map((r, i) => (marks.runway.get(i)?.severity === "unusable" ? { ...r, closed: true } : r));
  const longest = longestOpen(runways);
  const open = runways.filter((r) => !r.closed && r.length_ft != null).length;
  const wind = place.metar?.wind_speed_kt != null ? placeWind(place.metar) : null;
  const fuel = services?.fuel_types.length ? fuelNames(services.fuel_types) : null;
  return (
    <CardFacts testId="place-facts">
      {category && (
        <Fact label="Weather" testId="place-fact-weather">
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
        </Fact>
      )}
      {wind && (
        <Fact label="Wind" testId="place-fact-wind">
          {wind}
        </Fact>
      )}
      {longest?.length_ft != null && (
        <Fact label={open > 1 ? "Longest" : "Runway"} testId="place-fact-longest">
          {feet(longest.length_ft)}
        </Fact>
      )}
      {place.elevation_ft != null && (
        <Fact label="Elevation" testId="place-fact-elevation">
          {feet(place.elevation_ft)}
        </Fact>
      )}
      {away && (
        <Fact label={away.from ? `From ${away.from}` : "Distance"} testId="place-fact-distance">
          {away.words}
        </Fact>
      )}
      {fuel && (
        <Fact label="Fuel" testId="place-fact-fuel">
          {fuel}
        </Fact>
      )}
    </CardFacts>
  );
}
