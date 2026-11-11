import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { feet, grouped } from "../../../../lib/format";
import { airportQuery } from "../../../../lib/queryClient";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { TEXT } from "../../../../lib/text";

/**
 * What a hover preview shows of an airport (a search row's, a chart
 * mark's): its ident and name, its town, its elevation and longest
 * runway from the FAA's airport file, and its latest METAR's flight
 * category and report as the planner has them -- nothing worked out
 * here; a click on what it previews opens the card.
 */
export default function AirportPreview({ ident }: { ident: string }) {
  const { data: place, isError } = useQuery(airportQuery(ident));
  const longest = place?.runways.reduce<number | null>(
    (most, r) => (r.length_ft != null && r.length_ft > (most ?? 0) ? r.length_ft : most),
    null,
  );
  const category = place?.metar?.flight_category ?? null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="airport-preview">
      <p className={cn("font-semibold", TEXT.row)}>
        <span className="font-mono font-bold">{ident}</span>
        {place ? ` · ${place.name}` : ""}
      </p>
      {place?.municipality && <p className={cn("text-muted-foreground", TEXT.detail)}>{place.municipality}</p>}
      {place && (
        <p className={cn("tabular-nums", TEXT.detail)}>
          Elevation {feet(place.elevation_ft)}
          {longest ? ` · longest runway ${grouped(longest)} ft` : ""}
        </p>
      )}
      {place?.metar && (
        <p className={cn("flex items-start gap-2", TEXT.detail)}>
          {category && (
            <span
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{ background: colourOf(category) }}
              aria-label={`${category} weather`}
              role="img"
            />
          )}
          <span className="font-mono break-words">{place.metar.raw}</span>
        </p>
      )}
      {!place && (
        <p className={cn("text-muted-foreground", TEXT.detail)} role="status">
          {isError ? "Not found." : "Fetching…"}
        </p>
      )}
    </div>
  );
}
