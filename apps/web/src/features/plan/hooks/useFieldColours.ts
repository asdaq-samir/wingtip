import { useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import { identOf } from "../../../lib/identSchema";
import { chipColourOf } from "../../../lib/map/marks/flightCategory";
import { airportQuery } from "../../../lib/queryClient";
import { approximateOf, type PlannedRoute } from "./planAddress";
import type { PlanAnswer } from "./planTypes";

/**
 * An airport's METAR colour, as its chip on the map (usePlanWorkspace):
 * its flight category once the briefing has it, grey until then (the
 * route's pills, coloured by the weather in the settings).
 */
export function useFieldColours({
  briefing,
  planned,
  waypointStops,
}: {
  briefing: PlanAnswer["briefing"];
  planned: PlannedRoute;
  /** The stops flown through, which have no weather of their own. */
  waypointStops: Set<string>;
}) {
  const metars = briefing.state === "ready" ? briefing.data.metars : null;
  // A field with no report of its own colours as its card's chip does, at
  // the owner's ask ("why is there grey color for airport button metar? We
  // should get the modeled one in like the airport card has"): the weather
  // the National Weather Service's Gridded LAMP models at it for the hour
  // (wingtip.glmp), else the nearest station's report within ten miles
  // (PlaceCard's "≈"); grey only where neither is had. The route's fields'
  // cards, asked once and shared with their rows (airportQuery).
  const weatherFields = [planned.dep, ...planned.stops.filter((stop) => !waypointStops.has(stop)), planned.dest].filter(
    (ident) => !!identOf(ident),
  );
  const fieldCards = useQueries({ queries: weatherFields.map((ident) => ({ ...airportQuery(`${ident}`), staleTime: 10 * 60_000 })) });
  const approximate = new Map(
    weatherFields.map((ident, i) => {
      const card = fieldCards[i]?.data;
      const near = card?.nearby_metar?.near ? (card.nearby_metar.metar.flight_category ?? null) : null;
      return [ident, card?.modelled_weather?.flight_category ?? near] as const;
    }),
  );
  const approximateKey = [...approximate].map(([ident, category]) => `${ident}:${category ?? ""}`).join(",");
  const metarColour = useCallback(
    (ident: string) => {
      const metar = metars?.[ident];
      const category = metar?.flight_category ?? approximateOf(approximateKey, ident);
      return chipColourOf({ status: category ? "reported" : "no-report", category });
    },
    [metars, approximateKey],
  );
  return { metarColour };
}
