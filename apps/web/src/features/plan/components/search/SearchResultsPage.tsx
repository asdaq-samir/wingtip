import { useRef } from "react";
import { cn } from "cn";
import { useScrollPlace } from "../../../../lib/scrollPlace";
import { ChartMark } from "../../../../components/Favorites";
import type { NearestAirport } from "../../../../lib/api/types";
import { chipFillOf } from "../../../../lib/map/marks/flightCategory";
import { TEXT } from "../../../../lib/text";
import { nmAway } from "../../../../lib/useAway";
import { useSearchResultRows, useSearchResults } from "../../hooks/useSearchResults";
import FilterChips from "./FilterChips";
import FiltersPage from "./FiltersPage";

/** One result, as Apple's are laid out (the owner's screenshot of a search
 *  sent, 2026-11-10): the ident and name in bold, "Airport · Town · 23 nm"
 *  in grey, then the flight category's word in its own colour and what is
 *  known of the field -- towered, its longest runway -- and the field's
 *  chart symbol at the right in a rounded square, where Apple has a photo. */
function ResultRow({ field, onOpen }: { field: NearestAirport; onOpen: () => void }) {
  const use = field.military === "military" ? "military" : field.private ? "private" : null;
  const grey = ["Airport", field.municipality, nmAway(field.distance_nm)].filter(Boolean).join(" · ");
  const known = [
    field.towered ? "Towered" : null,
    field.longest_runway_ft ? `${field.longest_runway_ft.toLocaleString("en-US")} ft runway` : null,
  ];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      data-testid="search-result"
      data-ident={field.ident}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate font-semibold", TEXT.row)}>
          <span className="font-mono">{field.ident}</span> {field.name}
        </span>
        <span className={cn("truncate text-muted-foreground", TEXT.detail)}>{grey}</span>
        <span className={cn("truncate text-muted-foreground", TEXT.detail)}>
          {field.flight_category && (
            <span className="font-semibold" style={{ color: chipFillOf(field.flight_category) }}>
              {field.flight_category}
            </span>
          )}
          {[field.flight_category ? "" : null, ...known].filter((p) => p !== null).join(" · ")}
        </span>
      </span>
      <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true">
        <ChartMark space={field.airspace_class ?? null} category={field.flight_category} use={use} size={40} />
      </span>
    </button>
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
  const { rows, all, loading, failed } = useSearchResultRows();
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
      ? "The fields near there couldn't be fetched."
      : rows.length === 0
        ? all > 0
          ? "No field nearby fits these filters."
          : "No fields found nearby."
        : null;
  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-4" data-testid="search-results">
      <span ref={anchor} hidden />
      <FilterChips />
      <p className={cn("text-muted-foreground", TEXT.note)}>Near {sent.near.label}</p>
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
