import { Repeat } from "lucide-react";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { feet } from "../../../../lib/format";
import { RvrRows } from "../LiveAirportRows";
import { RunwayRow } from "../RunwayRow";

/** An airport's card's Runways tab (PlaceCard): its pattern altitude, each
 *  runway, and each runway's RVR now where the field reports it. */
export function PlaceRunwaysTab({ place }: { place: AirportPlace }) {
  // The longest runway open, what a pilot sizes a field by: a badge on its
  // row (it was a row of the Info tab's Details). None where the field has one.
  const open = place.runways.filter((r) => !r.closed && r.length_ft != null);
  const longest = open.length > 1 ? open.reduce((a, b) => (b.length_ft! > a.length_ft! ? b : a)) : null;
  return (
    <div data-testid="place-runways">
      <ListGroup>
        {place.pattern?.altitude_ft != null && (
          <ListRow
            media={
              <RowBadge colour={BADGE.runway}>
                <Repeat />
              </RowBadge>
            }
            title="Pattern altitude"
            // 1,000 ft above the field where none is published (AIM 4-3-3).
            description={place.pattern.published ? "As the FAA publishes it" : "1,000 ft above the field: none published"}
            value={<span className="font-semibold text-foreground">{feet(place.pattern.altitude_ft)}</span>}
            data-testid="place-pattern"
          />
        )}
        {place.runways.length ? (
          place.runways.map((r, i) => <RunwayRow key={`${r.ends}-${i}`} runway={r} longest={r === longest} />)
        ) : (
          <ListRow title="None listed" />
        )}
      </ListGroup>
      {/* Each runway's RVR now, where the field reports it. */}
      <RvrRows ident={place.ident} />
    </div>
  );
}
