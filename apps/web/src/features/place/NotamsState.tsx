import { ListRow } from "../../components/GroupedList";
import QueryState from "../../components/QueryState";
import { notamNone } from "../../lib/notamCoverage";
import type { FieldNotams } from "./fieldNotams";
import { WORDING } from "../../lib/wording/generated/wording";

/** What is said of the list itself, a row of the list as a section's
 *  "None listed" is: that it could not be fetched, with Try again in place
 *  (QueryState, as every list says it; it said "Could not be had just now"
 *  with no way to ask again), or that none was heard since the feed's time
 *  (lib/notamCoverage, decision 0059, never "no NOTAMs"); or, for a field the FAA issues none
 *  for, the engine's `none` (airport_notams_none: a private field with no
 *  NASR NOTAM_ID). */
export function NotamsState({
  data,
  query,
  none = null,
}: {
  data: FieldNotams | undefined;
  query: Parameters<typeof QueryState>[0]["query"];
  none?: string | null;
}) {
  if (query.isError) return <QueryState query={query} row fetching={WORDING.fetchingNotams} failed={WORDING.notamsNotFetched} />;
  if (data && !data.notams.length)
    return <ListRow muted title={none ?? notamNone(data.coverage_since, data.full_set)} data-testid="place-notams-none" />;
  return null;
}
