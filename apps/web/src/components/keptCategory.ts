import { useQuery } from "@tanstack/react-query";
import type { RecentAirport } from "../lib/preferences";
import { airportQuery } from "../lib/queryClient";

/** A kept airport's flight category: with no report of its own, the
 *  weather modelled at it, else a station's within ten miles, as its
 *  card's chip and FPL's symbols have it. The same query as its mark's. */
export function useKeptCategory(airport: RecentAirport) {
  const { data } = useQuery(airportQuery(airport.ident));
  return (
    data?.metar?.flight_category ??
    data?.modelled_weather?.flight_category ??
    (data?.nearby_metar?.near ? data.nearby_metar.metar.flight_category : null)
  );
}
