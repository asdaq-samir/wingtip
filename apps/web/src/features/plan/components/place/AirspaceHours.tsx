import type { Ref } from "react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { faaWords } from "../../../../lib/advisories";
import type { AirportPlace } from "../../../../lib/api/types";
import { classNow, normalHours, todayWords, type SurfaceHours } from "./surfaceHoursWords";

/**
 * A part-time surface area's hours in the airport card's Info tab, as Apple
 * Maps lists a place's opening hours (the owner, 2026-11-14, sending Maps'
 * place card: "when tapped it can show the times of airspace's like Apple
 * Maps does for open hours"): the class in force now, in the tint while
 * the part-time class is, today's times at its right ("Class D", "06:00–22:00,
 * then E"); then Normal hours, closed until asked, each day's times, days
 * alike grouped and today in bold. The engine's (surface_hours, AIM
 * 3-2-5a1), at the field's own clock; where the hours cannot be read, the
 * Chart Supplement's line itself, never a guess.
 */
export function AirspaceHours({
  surface,
  hours,
  line,
  open,
  onOpenChange,
  sectionRef,
}: {
  surface: NonNullable<AirportPlace["surface_airspace"]>;
  hours: SurfaceHours | null;
  /** NASR's AIRSPACE_HRS as sent, said where the engine could not read it. */
  line: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionRef: Ref<HTMLDivElement>;
}) {
  const now = classNow(surface, hours);
  const today = hours && todayWords(hours);
  return (
    <div className="scroll-mt-20 pt-5 first:pt-0" ref={sectionRef} data-testid="place-airspace-hours">
      <PillSection title="Airspace hours">
        <ListGroup>
          <ListRow
            title={<span className={cn(now === surface.class && "text-tint")}>{now ? `Class ${now}` : "Part-time"}</span>}
            description={today ? undefined : faaWords(line) || "Hours not published"}
            value={today ?? undefined}
            data-testid="place-airspace-now"
          />
          {hours?.known && (
            <Collapsible open={open} onOpenChange={onOpenChange}>
              <CollapsibleTrigger
                render={
                  <ListRow
                    title={<span className="text-muted-foreground">Normal hours</span>}
                    chevron
                    data-testid="place-airspace-week-open"
                  />
                }
              />
              <CollapsibleContent data-testid="place-airspace-week">
                {normalHours(hours).map((row) => (
                  <ListRow
                    key={row.days}
                    title={<span className={cn(row.today && "font-semibold")}>{row.days}</span>}
                    value={<span className={cn(row.today && "font-semibold text-foreground")}>{row.times}</span>}
                    data-testid="place-airspace-day"
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </ListGroup>
      </PillSection>
    </div>
  );
}
