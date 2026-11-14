import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Radio } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import { RowBadge } from "../../../components/RowBadge";
import { BADGE } from "../../../lib/rowBadges";
import { TEXT } from "../../../lib/text";
import { atisRows, datisRemarks, glanceWords, heardAny, type AtisReading } from "../lib/atis";
import { datisQuery, rvrQuery } from "../../../lib/liveReports";
import { usePreferences } from "../../../lib/preferences";
import { rvrRows } from "../lib/rvrRows";
import { useShown } from "../../../lib/shown";

/**
 * The field's D-ATIS, on the card's Weather tab, where the tower's data
 * link sends one (wingtip.datis, STDDS's TDES): each broadcast, arrival
 * and departure apart, read into the figures a heard ATIS is (the
 * engine's read_datis, read_atis's shape), its remarks a list under them,
 * an item a line in the FAA's words (the engine's datis_remarks), and its
 * words kept as sent at the foot. Nothing where the field has none.
 */
export function DigitalAtisRows({ ident }: { ident: string }) {
  // Asked each minute while its card is in sight, not under another tab
  // (lib/shown), and again on its return once a minute old.
  const { data } = useQuery({ ...datisQuery(ident), subscribed: useShown() });
  if (!data?.broadcasts.length) return null;
  return (
    <div className="pt-5" data-testid="place-datis">
      {data.broadcasts.map((b) => {
        // The engine's read_datis answer, read_atis's shape (the planner
        // passes it on as a plain object).
        const reading = b.reading as unknown as AtisReading;
        const which = b.which ? `${b.which.charAt(0).toUpperCase()}${b.which.slice(1)} D-ATIS` : "D-ATIS";
        const remarks = datisRemarks(b.text);
        // The words as sent and the credit close the broadcast, under its
        // remarks where it has any.
        const foot = (
          <>
            <Collapsible>
              <CollapsibleTrigger render={<ListRow title="As sent" chevron data-testid="place-datis-sent" />} />
              <CollapsibleContent>
                <ListRow
                  title={
                    <span className={cn("font-mono break-words text-muted-foreground", TEXT.detail)} data-testid="place-datis-raw">
                      {b.text}
                    </span>
                  }
                />
              </CollapsibleContent>
            </Collapsible>
            <ListRow muted title={<span className={TEXT.note}>FAA D-ATIS</span>} />
          </>
        );
        return (
          <Fragment key={`${b.which ?? "both"}`}>
            <ListGroup title={`${which}${b.letter ? `, information ${b.letter}` : ""}`}>
              {heardAny(reading) && (
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <Radio />
                    </RowBadge>
                  }
                  title={<span className="font-semibold text-foreground">{glanceWords(reading)}</span>}
                  data-testid="place-datis-glance"
                />
              )}
              {heardAny(reading) &&
                atisRows(reading, { remarks: false }).map((row, k) => (
                  <ListRow
                    key={`${row.label}-${k}`}
                    title={row.label}
                    value={<span className="text-foreground">{row.value}</span>}
                    data-testid="place-datis-row"
                  />
                ))}
              {!remarks.length && foot}
            </ListGroup>
            {remarks.length > 0 && (
              <ListGroup title="Remarks" className="pt-5">
                {/* An item a line, left-aligned and wrapping, in the
                    broadcast's order: a list to read, not a figure. */}
                {remarks.map((remark, k) => (
                  <ListRow
                    key={`${k}-${remark}`}
                    title={<span className="text-foreground">{remark}</span>}
                    data-testid="place-datis-remark"
                  />
                ))}
                {foot}
              </ListGroup>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The field's runway visual range, on the card's Runways tab under its
 * runways, where its RVR system reports on SWIM (wingtip.rvr): each
 * runway end's touchdown, midpoint and rollout readings in feet, and a
 * runway under the pilot's own visibility minimum said so by the engine
 * (rvr_check, 14 CFR 91.175(h)(2)). Nothing where the field has none.
 */
export function RvrRows({ ident }: { ident: string }) {
  const { data } = useQuery({ ...rvrQuery(ident), subscribed: useShown() });
  const minimumSm = usePreferences((s) => s.minimums.visibilitySm);
  if (!data?.runways.length) return null;
  const rows = rvrRows(data.runways, minimumSm);
  return (
    <div className="pt-5" data-testid="place-rvr">
      <ListGroup title="Runway visual range, ft">
        {rows.map((r) => (
          <ListRow
            key={r.runway}
            media={
              <RowBadge colour={BADGE.runway}>
                <Eye />
              </RowBadge>
            }
            title={`RVR ${r.runway}`}
            description={
              r.under ? (
                <span className="text-destructive" data-testid="place-rvr-under">
                  {r.under}
                </span>
              ) : (
                "Touchdown · midpoint · rollout"
              )
            }
            value={<span className="font-semibold text-foreground tabular-nums">{r.readings}</span>}
            data-testid="place-rvr-row"
          />
        ))}
        <ListRow muted title={<span className={TEXT.note}>FAA RVR, through SWIM</span>} />
      </ListGroup>
    </div>
  );
}
