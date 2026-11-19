import { ListGroup, ListRow } from "../../components/GroupedList";
import type { NavLogAltitude } from "../../lib/api/types";
import { altFt, feetBelowClouds } from "../plan";

/** What has to be said over the table, as rows: legs flown without wind,
 *  and clouds the legs cannot be told for, in red. Nothing at all when
 *  there is none of it: the arrival is the section's own line, and the
 *  table is the rest, as the pilot asked. (The altitude, which opens how
 *  it was chosen, is the Alt column's head.) */
export function NavLogSummary({ noWind, nav, perLeg }: { noWind: string | null; nav: NavLogAltitude | null; perLeg: boolean }) {
  const cloudsUnplaced = !!nav && !nav.altitude_selection.cloud_clearance_kept && !perLeg;
  if (!noWind && !cloudsUnplaced) return null;
  return (
    <div className="mb-3" data-testid="navlog-summary">
      <ListGroup>
        {noWind && <ListRow title={<span className="text-destructive">{noWind}</span>} />}
        {/* The clouds forecast near a leg leave it no legal altitude (14
          CFR 91.155): the plan still stands, over the band without
          them, and the briefing says so (Current Conditions, the
          reasoning) -- here as well only when the legs cannot be told. */}
        {nav && cloudsUnplaced && (
          <ListRow
            title={<span className="text-destructive">Too low for VFR under the clouds near {nav.altitude_selection.cloud_station}</span>}
            // 91.155(a)'s distance below the clouds, the engine's, as the
            // reasoning says it.
            description={`No altitude keeps ${altFt(feetBelowClouds(nav.altitude_selection.cloud_ceiling_ft))} ft below the forecast clouds there`}
          />
        )}
      </ListGroup>
    </div>
  );
}
