import { useQuery } from "@tanstack/react-query";
import { Eye, Radio } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import { RowBadge } from "../../../components/RowBadge";
import { BADGE } from "../../../lib/rowBadges";
import { TEXT } from "../../../lib/text";
import { atisRows, glanceWords, heardAny, type AtisReading } from "../../../lib/atis";
import { datisQuery, rvrQuery } from "../../../lib/liveReports";
import { usePreferences } from "../../../lib/preferences";
import { rvrRows } from "../../../lib/rvrRows";

/**
 * The field's D-ATIS, on the card's Weather tab, where the tower's data
 * link sends one (wingtip.datis, STDDS's TDES): each broadcast, arrival
 * and departure apart, read into the figures a heard ATIS is (the
 * engine's read_datis, read_atis's shape), its words kept as sent under
 * them. Nothing where the field has none.
 */
export function DigitalAtisRows({ ident }: { ident: string }) {
  const { data } = useQuery(datisQuery(ident));
  if (!data?.broadcasts.length) return null;
  return (
    <div className="pt-5" data-testid="place-datis">
      {data.broadcasts.map(b => {
        // The engine's read_datis answer, read_atis's shape (the planner
        // passes it on as a plain object).
        const reading = b.reading as unknown as AtisReading;
        const which = b.which ? `${b.which.charAt(0).toUpperCase()}${b.which.slice(1)} D-ATIS` : "D-ATIS";
        return (
          <ListGroup key={`${b.which ?? "both"}`} title={`${which}${b.letter ? `, information ${b.letter}` : ""}`}>
            {heardAny(reading) && (
              <ListRow
                media={<RowBadge colour={BADGE.weather}><Radio /></RowBadge>}
                title={<span className="font-semibold text-foreground">{glanceWords(reading)}</span>} data-testid="place-datis-glance"
              />
            )}
            {heardAny(reading) && atisRows(reading).map((row, k) => (
              <ListRow key={`${row.label}-${k}`} title={row.label} value={<span className="text-foreground">{row.value}</span>} data-testid="place-datis-row" />
            ))}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <ListRow title="As sent" chevron data-testid="place-datis-sent" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ListRow title={<span className={cn("font-mono break-words text-muted-foreground", TEXT.detail)} data-testid="place-datis-raw">{b.text}</span>} />
              </CollapsibleContent>
            </Collapsible>
            <ListRow muted title={<span className={TEXT.note}>FAA D-ATIS</span>} />
          </ListGroup>
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
  const { data } = useQuery(rvrQuery(ident));
  const minimumSm = usePreferences(s => s.minimums.visibilitySm);
  if (!data?.runways.length) return null;
  const rows = rvrRows(data.runways, minimumSm);
  return (
    <div className="pt-5" data-testid="place-rvr">
      <ListGroup title="Runway visual range, ft">
        {rows.map(r => (
          <ListRow
            key={r.runway}
            media={<RowBadge colour={BADGE.runway}><Eye /></RowBadge>}
            title={`RVR ${r.runway}`}
            description={r.under ? <span className="text-destructive" data-testid="place-rvr-under">{r.under}</span> : "Touchdown · midpoint · rollout"}
            value={<span className="font-semibold text-foreground tabular-nums">{r.readings}</span>} data-testid="place-rvr-row"
          />
        ))}
        <ListRow muted title={<span className={TEXT.note}>FAA RVR, through SWIM</span>} />
      </ListGroup>
    </div>
  );
}
