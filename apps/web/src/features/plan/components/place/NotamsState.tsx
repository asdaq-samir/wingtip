import { ListRow } from "../../../../components/GroupedList";
import type { FieldNotams } from "./fieldNotams";

/** What is said of the list itself, a row of the list as a section's
 *  "None listed" is: that it could not be had, or that none was heard
 *  since the feed's time (decision 0023, never "no NOTAMs"); or, for a
 *  field the FAA issues none for, the engine's `none` (airport_notams_none:
 *  a private field with no NASR NOTAM_ID). */
export function NotamsState({ data, isError, none = null }: { data: FieldNotams | undefined; isError: boolean; none?: string | null }) {
  if (isError) return <ListRow muted title="Could not be had just now" />;
  if (data && !data.notams.length)
    return (
      <ListRow
        muted
        title={none ?? (data.coverage_since ? `None heard since ${data.coverage_since}` : "None heard")}
        data-testid="place-notams-none"
      />
    );
  return null;
}
