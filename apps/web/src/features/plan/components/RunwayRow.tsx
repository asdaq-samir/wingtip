import type { ReactNode } from "react";
import { ListRow } from "../../../components/GroupedList";
import { Badge } from "../../../components/ui/badge";
import type { Runway } from "../../../lib/api/types";
import { cn } from "cn";
import { runwayWind, surfaceName } from "../format";
import { usePreferences } from "../../../lib/preferences";
import { runwayNumber } from "../lib/pattern";
import { RowBadge } from "../../../components/RowBadge";
import { BADGE } from "../../../lib/rowBadges";
import { TEXT } from "../../../lib/text";
import { grouped } from "../../../lib/format";
import { runwayCrosswindKt } from "../lib/wind";

/** A runway drawn on its badge, laid along its true heading as the
 *  chart lays it (north up), its centre line dashed; upright where its
 *  heading is not known. */
function RunwayGlyph({ headingDeg }: { headingDeg: number | null }) {
  return (
    <RowBadge colour={BADGE.runway}>
      <svg viewBox="-9 -9 18 18" fill="none">
        <g transform={`rotate(${headingDeg ?? 0})`}>
          <rect x="-2.6" y="-8.5" width="5.2" height="17" rx="1" fill="currentColor" />
          <line x1="0" y1="-6.5" x2="0" y2="6.5" stroke={BADGE.runway} strokeWidth="0.9" strokeDasharray="1.6 1.4" />
        </g>
      </svg>
    </RowBadge>
  );
}

/** A runway as an airport's card and the briefing list it: its ends, its
 *  surface and lights, its size, and the reported wind on the end it
 *  favours -- in amber where its crosswind is over the pilot's own
 *  minimum (lib/minimums) -- and any end flown with right traffic. */
export function RunwayRow({
  runway,
  longest = false,
  bestWind = false,
  notam,
  onClick,
}: {
  runway: Runway;
  /** The field's longest runway open, marked with a badge by its name (the
   *  airport card's Runways tab; the owner, 2026-11-11: "just put a longest
   *  badge on the runway in runway tab"). */
  longest?: boolean;
  /** The runway most nearly into the reported wind, marked by its name
   *  (the airport card's Runways tab; the owner, 2026-11-11: "best wind
   *  runways should get the best wind badge"). */
  bestWind?: boolean;
  /** A NOTAM's badge on it (the airport card's NotamBadge), by its name,
   *  and the row's tap that opens that NOTAM (the owner, 2026-11-11:
   *  "tapping the affected thing should show the notam"). */
  notam?: ReactNode;
  onClick?: () => void;
}) {
  // An end flown with right traffic is said, as the sectional's "RP 23"
  // says it: the rest are left, as every pattern is unless the FAA says.
  const right = (runway.runway_ends ?? []).filter((e) => e.traffic === "right").map((e) => runwayNumber(e.ident));
  const detail = [
    surfaceName(runway.surface),
    runway.lighted && "lighted",
    runway.closed && "closed",
    right.length > 0 && `right traffic ${right.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const most = usePreferences((s) => s.minimums.crosswindKt);
  const wind = runway.wind;
  const over = !!wind && most != null && runwayCrosswindKt(wind) > most;
  const heading = (runway.runway_ends ?? []).find((e) => e.heading_true_deg != null)?.heading_true_deg ?? null;
  return (
    <ListRow
      onClick={onClick}
      chevron={!!onClick}
      data-testid="runway-row"
      media={<RunwayGlyph headingDeg={heading} />}
      title={
        <span className="flex items-center gap-2">
          {`Runway ${runway.ends ?? "—"}`}
          {bestWind && (
            <Badge variant="secondary" data-testid="runway-best-wind">
              Best Wind
            </Badge>
          )}
          {longest && (
            <Badge variant="secondary" data-testid="runway-longest">
              Longest
            </Badge>
          )}
          {notam}
        </span>
      }
      description={
        (detail || runway.wind) && (
          <>
            {detail && <span className="block">{detail}</span>}
            {wind && (
              <span className={cn("block", over && "font-medium text-caution-ink")} data-testid="runway-wind">
                {runwayWind(wind)}
                {over && `, over your ${most} kt`}
              </span>
            )}
          </>
        )
      }
      // How long, the figure a pilot looks for, at the right in the text's
      // own colour, as Nearest has a field's distance; how wide under it.
      value={
        runway.length_ft ? (
          <span className="flex flex-col items-end">
            <span className="font-semibold text-foreground">{grouped(runway.length_ft)} ft</span>
            {runway.width_ft != null && <span className={cn("text-muted-foreground", TEXT.note)}>{runway.width_ft} ft wide</span>}
          </span>
        ) : (
          "—"
        )
      }
    />
  );
}
