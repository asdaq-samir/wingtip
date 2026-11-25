import { cn } from "cn";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Skeleton } from "../../components/ui/skeleton";
import type { Runway } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { trafficPattern } from "../../lib/trafficPattern";
import { landingRunway, runwayNumber, type Landing, type ProcedureAirport, type RunwayEnd, type WindPick } from "../plan";
import type { EndFit } from "./runwayFit";
import { endChoice, runwayEnds } from "./runwayChoice";
import { SLIM_PILL } from "./routeListStyle";

/**
 * A field's runway on its Landing or Takeoff line on FPL's list, a slim
 * pill that opens a menu of its runways, as the route box's pills open
 * theirs (the owner, 2026-11-25: "we don't need the folding runways. When
 * the runway is selected it stays there"): "RWY 5", the wind's mark on the
 * end the wind favours, a ring where it fits badly today; in the menu each
 * end with how it fits. With an approach, only the approach's own runway
 * or, where the plate publishes circling minimums, another (AIM 5-4-20;
 * the engine's landing_runway); with none, only an end whose pattern can
 * be drawn (a surveyed threshold).
 */
export function RunwayPill({
  airport: a,
  wind,
  chosen,
  landing,
  fitOf,
  label,
  note,
  onPick,
}: {
  airport: ProcedureAirport;
  wind: WindPick | null;
  chosen: string | null;
  landing: Landing | null;
  fitOf: (runway: Runway, end: RunwayEnd) => EndFit | null;
  /** Its name to a reader: the field's runway, or its takeoff runway. */
  label: string;
  /** How the runway picked is flown, said in its name ("Straight in",
   *  "Circle to land", its pattern's side and height). */
  note: string | null;
  onPick: (end: string) => void;
}) {
  if (a.runways === null) return <Skeleton aria-label="Fetching the runways" className="h-6 w-20 rounded-full" />;
  const ends = runwayEnds(a);
  if (!ends.length) return null;
  const into = wind && !wind.calm ? wind.ident : null;
  const own = landingRunway(landing, null, false);
  const picked = chosen !== null ? ends.find((e) => runwayNumber(e.end.ident) === chosen) : undefined;
  const shown = picked && endChoice(picked.runway, picked.end, into, fitOf);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="plain"
            size="inline"
            type="button"
            className={cn(SLIM_PILL, shown?.ring)}
            aria-label={`${label}: ${shown ? shown.words : "none picked"}${note ? `, ${note}` : ""}, pick another`}
            data-testid="runway-pill"
            data-fit={shown?.fit}
          />
        }
      >
        <span>RWY</span>
        {shown ? <span className="flex items-center gap-0.5 font-semibold text-tint">{shown.face}</span> : <span>—</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={chosen ?? ""} onValueChange={(v) => v && onPick(String(v))}>
          {ends.map(({ runway, end }) => {
            const c = endChoice(runway, end, into, fitOf);
            const circleNa = !(own.othersAllowed || c.id === own.runway);
            const drawn = trafficPattern(a.ident, runway, end.ident, a.patternAltitudeFt) !== null;
            return (
              <DropdownMenuRadioItem
                key={end.ident}
                value={c.id}
                disabled={circleNa || (!landing && !drawn)}
                aria-label={`${c.words}${circleNa ? `, no circling on the ${landing!.name}` : !landing && !drawn ? ", not surveyed" : ""}`}
                data-testid="runway-option"
              >
                <span className="flex items-center gap-1 font-semibold">RWY {c.face}</span>
                {c.note && (
                  <span
                    className={cn(
                      "ml-auto pl-3",
                      TEXT.note,
                      c.fit === "short" ? "text-destructive" : c.fit ? "text-caution" : "text-muted-foreground",
                    )}
                  >
                    {c.note}
                  </span>
                )}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
