import { useQuery } from "@tanstack/react-query";
import { airportMarkSvg } from "../lib/map/marks/airportMark";
import { colourOf } from "../lib/map/marks/flightCategory";
import type { AirspaceClass, RecentAirport } from "../lib/preferences";
import { airportQuery } from "../lib/queryClient";
import { useKeptCategory } from "./keptCategory";

/** An airport's own chart symbol, small, as the map draws it
 *  (lib/map/marks/airportMark): its airspace's ring and colour, its METAR's
 *  dot, a military or private field's letter -- one mark for the pills'
 *  airports, Favorites' as Nearest's, at the owner's ask ("Airports should
 *  have the same symbols as nearest"). */
export function ChartMark({
  space,
  category,
  use,
  size = 22,
}: {
  space: AirspaceClass | null;
  category: string | null | undefined;
  use: "military" | "private" | null;
  /** Its width in points: the pills' 22, a tile's 44; or "row", a list
   *  row's 30 in rem (size.chart-mark), Search's, Nearest's and Favorites'
   *  alike and growing with the row's words (the scale audit's Q5: Nearest
   *  drew 26 and Search 30, neither growing). */
  size?: number | "row";
}) {
  const box = size === "row" ? "var(--size-chart-mark)" : Math.max(28, size);
  const drawn = size === "row" ? "var(--size-chart-mark)" : size;
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center" style={{ width: box, height: box }}>
      <span
        className="block"
        style={{ width: drawn, height: drawn }}
        dangerouslySetInnerHTML={{ __html: airportMarkSvg(space, colourOf(category), use, "block size-full overflow-visible") }}
      />
    </span>
  );
}

/** A kept airport's chart symbol (ChartMark), from the field as the
 *  planner has it -- the query useAirspace asks, so none more -- its
 *  weather and whose it is with its airspace. */
export function KeptChartMark({ airport, size }: { airport: RecentAirport; size?: number | "row" }) {
  const { data } = useQuery(airportQuery(airport.ident));
  const use = data?.military === "military" ? "military" : data?.private ? "private" : null;
  const category = useKeptCategory(airport);
  return <ChartMark space={data?.airspace_class ?? airport.airspace ?? null} category={category} use={use} size={size} />;
}
