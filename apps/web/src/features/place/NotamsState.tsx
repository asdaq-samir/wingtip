import { ListRow } from "../../components/GroupedList";
import { notamNone } from "../../lib/notamCoverage";
import type { FieldNotams } from "./fieldNotams";

/** What is said of the list itself, a row of the list as a section's
 *  "None listed" is: that it could not be had, or that none was heard
 *  since the feed's time (lib/notamCoverage, decision 0059, never "no
 *  NOTAMs"); or, for a field the FAA issues none for, the engine's `none`
 *  (airport_notams_none: a private field with no NASR NOTAM_ID). */
export function NotamsState({ data, isError, none = null }: { data: FieldNotams | undefined; isError: boolean; none?: string | null }) {
  if (isError) return <ListRow muted title="Could not be had just now" />;
  if (data && !data.notams.length)
    return <ListRow muted title={none ?? notamNone(data.coverage_since, data.full_set)} data-testid="place-notams-none" />;
  return null;
}
