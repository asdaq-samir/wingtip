import { ListRow } from "../../../../components/GroupedList";
import { SearchField } from "../../../../components/PanelCapsule";
import type { FieldNotams } from "./fieldNotams";

/**
 * The NOTAM list's filter, at the top of the airport card's NOTAMs (the
 * owner, 2026-11-12: "The NOTAM list gets a search field"): the same
 * stock field as Nearest's at the top of its card (PanelCapsule's
 * SearchField, shadcn's InputGroup), narrowing this list as it is typed in.
 * It is not a second search (rules.md 1.5, "One search field"): it finds
 * nothing outside the list and opens nothing, and the one search is out of
 * sight while a card is up. Escape only lets the field go, as Nearest's.
 */
export function NotamFilter({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  return (
    <div className="pb-2">
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder="Search NOTAMs"
        label="Search this airport's NOTAMs"
        testId="place-notams-search"
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />
    </div>
  );
}

/** What is said of the list itself, a row of the list as a section's
 *  "None listed" is: that it could not be had, that none was heard since
 *  the feed's time (decision 0023, never "no NOTAMs"), or that none of
 *  them says what is typed in the filter. */
export function NotamsState({
  data,
  isError,
  query,
  found,
}: {
  data: FieldNotams | undefined;
  isError: boolean;
  query: string;
  found: number;
}) {
  if (isError) return <ListRow muted title="Could not be had just now" />;
  if (data && !data.notams.length)
    return (
      <ListRow
        muted
        title={data.coverage_since ? `None heard since ${data.coverage_since}` : "None heard"}
        data-testid="place-notams-none"
      />
    );
  if (query.trim() && !found) return <ListRow muted title={`None says “${query.trim()}”`} data-testid="place-notams-unmatched" />;
  return null;
}
