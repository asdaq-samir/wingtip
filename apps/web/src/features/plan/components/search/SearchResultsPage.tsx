import { useRef } from "react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { useScrollPlace } from "../../../../lib/scrollPlace";
import { ChartMark } from "../../../../components/Favorites";
import { USE_WORDS } from "../../../../lib/airportIndex";
import type { NearestAirport } from "../../../../lib/api/types";
import { chipFillOf } from "../../../../lib/map/marks/flightCategory";
import { visibilityWords } from "../../../../lib/map/marks/airportWeather";
import { clockTime } from "../../../../lib/format";
import { TEXT } from "../../../../lib/text";
import { NO_CONNECTION } from "../../../../lib/problems";
import { nmAway } from "../../../../lib/useAway";
import { windLine } from "../../format";
import { SURFACE_WORDS, type Surface } from "../../lib/searchFilters";
import { useSearchResultRows, useSearchResults } from "../../hooks/useSearchResults";
import FilterChips from "./FilterChips";
import FiltersPage from "./FiltersPage";

/** A category's word in its own colour, as the map's chip has it. */
function Category({ category, children }: { category: string; children?: string }) {
  return (
    <span className="font-semibold" style={{ color: chipFillOf(category) }}>
      {children ?? category}
    </span>
  );
}

/** One result, as Apple's are laid out (the owner's screenshot of a search
 *  sent, 2026-11-10): the ident and name in bold, "Airport · Town · 23 nm"
 *  in grey; then the weather -- the flight category's word in its own
 *  colour, the METAR's wind and visibility, and with "VFR at…" asked the
 *  forecast category then ("MVFR at 15:00"); then what is known of the
 *  field -- towered, its longest runway and surfaces, an instrument
 *  approach, the fuel it sells -- and the field's chart symbol at the
 *  right in a rounded square, where Apple has a photo. */
function ResultRow({ field, onOpen }: { field: NearestAirport; onOpen: () => void }) {
  const use = field.military === "military" ? "military" : field.private ? "private" : null;
  // Who may use it where it is not a public field, as every search row says it.
  const used = field.military ?? (field.private ? "private" : null);
  const grey = ["Airport", used && USE_WORDS[used], field.municipality, nmAway(field.distance_nm)].filter(Boolean).join(" · ");
  const surfaces = (field.runway_surfaces ?? []).filter((k): k is Surface => k in SURFACE_WORDS).map((k) => SURFACE_WORDS[k]);
  const known = [
    field.towered ? "Towered" : null,
    field.longest_runway_ft ? `${field.longest_runway_ft.toLocaleString("en-US")} ft runway` : null,
    surfaces.length ? surfaces.join(", ") : null,
    field.instrument_approach ? "Approach" : null,
    field.fuel?.length ? field.fuel.join(", ") : null,
  ].filter(Boolean);
  const reported = field.wind_speed_kt != null || field.visibility_sm != null;
  const weather = [
    field.wind_speed_kt != null ? `Wind ${windLine(field)}` : null,
    field.visibility_sm != null ? visibilityWords(field.visibility_sm) : null,
  ].filter(Boolean);
  const forecast = field.forecast?.category ?? null;
  const forecastAt = field.forecast ? clockTime(new Date(field.forecast.at * 1000)) : null;
  return (
    <Button
      variant="ghost"
      size="inline"
      type="button"
      onClick={onOpen}
      className={cn(
        "justify-start text-inherit hover:bg-transparent",
        "flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      data-testid="search-result"
      data-ident={field.ident}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate font-semibold", TEXT.row)}>
          <span className="font-mono">{field.ident}</span> {field.name}
        </span>
        <span className={cn("truncate text-muted-foreground", TEXT.detail)}>{grey}</span>
        {(field.flight_category || reported || forecast) && (
          <span className={cn("truncate text-muted-foreground", TEXT.detail)} data-testid="search-result-weather">
            {field.flight_category && <Category category={field.flight_category} />}
            {[field.flight_category ? "" : null, ...weather].filter((p) => p !== null).join(" · ")}
            {forecast && (
              <>
                {field.flight_category || weather.length ? " · " : ""}
                <Category category={forecast}>{`${forecast} at ${forecastAt}`}</Category>
              </>
            )}
          </span>
        )}
        {known.length > 0 && (
          <span className={cn("truncate text-muted-foreground", TEXT.detail)} data-testid="search-result-facts">
            {known.join(" · ")}
          </span>
        )}
      </span>
      <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true">
        <ChartMark space={field.airspace_class ?? null} category={field.flight_category} use={use} size={40} />
      </span>
    </Button>
  );
}

/**
 * A search sent (the one search's "Search Nearby", useSearchResults), in
 * the sheet under the field as Apple Maps lays out a search's results (the
 * owner's screenshots, 2026-11-10): the chips that narrow it, then the
 * fields in one white group, nearest first; a row opens the field's card,
 * whose close comes back here. The Filters page in its place while it is
 * open, in the same sheet.
 */
export default function SearchResultsPage() {
  const sent = useSearchResults((s) => s.sent);
  const filtering = useSearchResults((s) => s.draft !== null);
  const open = useSearchResults((s) => s.open);
  const { rows, all, loading, failed, onDevice, offline } = useSearchResultRows();
  // The Filters page starts at its top; closed, the list is where it was.
  const anchor = useRef<HTMLSpanElement>(null);
  useScrollPlace(anchor, filtering);
  if (!sent) return null;
  if (filtering)
    return (
      <>
        <span ref={anchor} hidden />
        <FiltersPage />
      </>
    );
  const note = loading
    ? "Searching…"
    : failed
      ? offline
        ? `${NO_CONNECTION}.`
        : "The fields near there couldn't be fetched."
      : rows.length === 0
        ? all > 0
          ? "No field nearby fits these filters."
          : "No fields found nearby."
        : null;
  return (
    // Its sides the page's own sixteen (TabPage), not 32 (F-P1).
    <div className="flex flex-col gap-3 pt-2 pb-4" data-testid="search-results">
      <span ref={anchor} hidden />
      <FilterChips />
      <p className={cn("text-muted-foreground", TEXT.note)}>
        Near {sent.near.label}
        {onDevice && <span data-testid="search-on-device"> · From this device, without weather</span>}
      </p>
      {note ? (
        <p role="status" className={cn("py-6 text-center text-muted-foreground", TEXT.prose)}>
          {note}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl bg-card">
          {rows.map((field) => (
            <ResultRow key={field.ident} field={field} onOpen={() => open?.(field.ident)} />
          ))}
        </div>
      )}
    </div>
  );
}
