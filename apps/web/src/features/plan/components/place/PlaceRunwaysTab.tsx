import { Repeat } from "lucide-react";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { feet } from "../../../../lib/format";
import { RvrRows } from "../LiveAirportRows";
import { RunwayRow } from "../RunwayRow";
import { runwayInUse } from "../../lib/pattern";
import { NotamBadge, NotamSheet } from "./NotamBadge";
import { useNotamMarks, useNotamSheet } from "./notamBadges";

/** An airport's card's Runways tab (PlaceCard): its pattern altitude, each
 *  runway, a NOTAM's badge by its name ("Closed") and a tap on it opening
 *  that NOTAM, and each runway's RVR now where the field reports it. */
export function PlaceRunwaysTab({ place }: { place: AirportPlace }) {
  // The longest runway open, what a pilot sizes a field by: a badge on its
  // row (it was a row of the Info tab's Details). None where the field has one.
  const open = place.runways.filter((r) => !r.closed && r.length_ft != null);
  const longest = open.length > 1 ? open.reduce((a, b) => (b.length_ft! > a.length_ft! ? b : a)) : null;
  // The runway most nearly into the reported wind (AC 90-66C 11.5, the
  // engine's gonogo_runway_in_use over each runway's wind on the end it
  // favours): only where the wind chose it, not a calm field's most used.
  const inUse = runwayInUse(place.runways);
  const bestWind = inUse?.byWind ? inUse.runway : null;
  const marks = useNotamMarks(place.ident, place);
  const sheet = useNotamSheet();
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
          place.runways.map((r, i) => {
            const mark = marks.runway.get(i);
            return (
              <RunwayRow
                key={`${r.ends}-${i}`}
                runway={r}
                longest={r === longest}
                bestWind={r === bestWind}
                notam={mark && <NotamBadge mark={mark} kind="runway" />}
                onClick={mark && (() => sheet.show(mark))}
              />
            );
          })
        ) : (
          <ListRow title="None listed" />
        )}
      </ListGroup>
      {/* Each runway's RVR now, where the field reports it. */}
      <RvrRows ident={place.ident} />
      {sheet.shown && <NotamSheet notams={sheet.shown} ident={place.ident} onClose={sheet.close} />}
    </div>
  );
}
