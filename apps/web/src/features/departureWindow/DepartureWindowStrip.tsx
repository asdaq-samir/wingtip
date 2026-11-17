import { Moon } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../components/Favorites";
import FindingIcon from "../../components/FindingIcon";
import { Carousel, CarouselContent, CarouselItem } from "../../components/ui/carousel";
import { Skeleton } from "../../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { describeError } from "../../lib/api/client";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { HOUR_FINDING, HOUR_WORD, bestLine, clock, dayOf, hourFigures, hourLabel } from "./hourWords";
import { useDepartureWindow } from "./useDepartureWindow";
import { FieldError } from "../../components/ui/field";

/** Each hour's tile's tint, as the Brief's verdict is tinted: the colour
 *  beside a mark of its own shape, never the colour alone. */
const TILE_TINT = {
  ok: "bg-go/12",
  caution: "bg-caution/15",
  stop: "bg-destructive/12",
  unknown: "bg-muted",
  pending: "bg-muted",
} as const;

/**
 * "When should I go?" in the Brief, under the verdict: an hour-by-hour strip across as far as the forecasts reach, each
 * hour go, caution, no-go or not known by the Brief's own Go / No-Go for
 * a flight leaving then, the best window said over it ("Best: 07:00–10:00
 * CST"), and a tap on an hour opening why, with its time and fuel. Its
 * state is useDepartureWindow's.
 */
export default function DepartureWindowStrip() {
  const m = useDepartureWindow();
  // Signed out, nothing: a line asking to sign in sat among the Brief's
  // findings (the owner, 2026-11-16: "How do we make brief less cluttered?").
  if (!m.shown || !m.signedIn) return null;
  const now = new Date();
  const title = m.best ? bestLine(m.best, now) : "When to go";
  return (
    <PillSection title={title} testId="departure-window">
      {m.error ? (
        // Where it happened, not a toast (lib/problems).
        <FieldError className={cn(TEXT.detail, "text-muted-foreground")}>
          Hours unavailable: {describeError(m.error, "the planner did not answer")}
        </FieldError>
      ) : m.pending ? (
        // Each tile the hour's own shape -- its hour's line, its mark and
        // the night's row -- in the strip's own room round it (py-1), so the
        // hours come in where their shapes were and the Brief under them
        // does not move (the flicker audit's FL-21).
        <div className="flex gap-2 py-1" aria-busy="true" data-testid="departure-window-pending">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-xl py-1.5" aria-hidden="true">
              <span className={TEXT.detail}>&nbsp;</span>
              <span className="size-5" />
              <span className="h-3" />
            </Skeleton>
          ))}
        </div>
      ) : m.hours.length === 0 ? (
        <p className={cn(TEXT.detail, "text-muted-foreground")}>No TAF along the route reaches past the next hour.</p>
      ) : (
        <>
          {!m.best && (
            <p className={cn(TEXT.detail, "text-muted-foreground")}>
              No hour with nothing against it before {clock(m.hours.at(-1)!.depart)}.
            </p>
          )}
          {/* Across, as far as the forecasts reach: the strip slides, the
              page does not -- shadcn's Carousel (Embla), as CardPictures
              and RecentCards are, a sideways drag the strip's and an up or
              down one the sheet's, the hour focused brought into sight
              (Embla's watchFocus), from the card's edge to its edge. The
              stock ToggleGroup round it, one hour at most picked (Base
              UI's single selection, its arrow keys along the strip; the
              owner, 2026-11-10), where the tiles were buttons of our own.
              Each tile's hit area is 44 points by its pseudo-element, the
              tiles gap-2 apart so the areas meet, room above and below
              them so neither it nor the picked one's ring is clipped. */}
          <ToggleGroup
            value={m.selected ? [m.selected.depart] : []}
            onValueChange={(value) => m.pick(value[0] ?? null)}
            aria-label="Departure hours"
            // The last ask's hours, dimmed, while this one's come.
            aria-busy={m.stale || undefined}
            className={cn("-mx-4 block w-auto", m.stale && "opacity-50")}
          >
            <Carousel opts={{ align: "start", dragFree: true }} data-slides="" data-base-ui-swipe-ignore="x">
              <CarouselContent className="ml-0 py-1">
                {m.hours.map((h) => {
                  const finding = HOUR_FINDING[h.verdict];
                  const day = dayOf(h.depart, now);
                  return (
                    <CarouselItem
                      key={h.depart}
                      // Room for the tile alone: the hour is the group's
                      // button, not a slide of its own to a screen reader.
                      role="none"
                      aria-roledescription={undefined}
                      className="basis-auto pl-2 first:pl-4 last:pr-4"
                    >
                      <ToggleGroupItem
                        value={h.depart}
                        aria-label={hourLabel(h)}
                        data-testid="departure-window-hour"
                        data-verdict={h.verdict}
                        className={cn(
                          "relative h-auto w-12 flex-col gap-0.5 rounded-xl py-1.5",
                          "after:absolute after:-inset-1 data-pressed:ring-2 data-pressed:ring-tint",
                          TILE_TINT[finding],
                        )}
                      >
                        <span className={cn(TEXT.detail, "tabular-nums text-foreground")}>{clock(h.depart).slice(0, 2)}</span>
                        <FindingIcon finding={finding} className="size-5" />
                        {h.night ? <Moon className="size-3 text-muted-foreground" aria-hidden /> : <span className="h-3" aria-hidden />}
                        {day && <span className="sr-only">{day}</span>}
                      </ToggleGroupItem>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            </Carousel>
          </ToggleGroup>
          {m.selected && (
            <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-3.5 py-2.5" data-testid="departure-window-detail">
              <div className={cn("flex items-center gap-2 font-medium", TEXT.row)}>
                <FindingIcon finding={HOUR_FINDING[m.selected.verdict]} className="size-5" />
                <span className={FINDING_TONE[HOUR_FINDING[m.selected.verdict]]}>
                  {HOUR_WORD[m.selected.verdict]} leaving {clock(m.selected.depart)}
                </span>
              </div>
              {m.selected.reasons.map((r) => (
                <p key={r.key} className={TEXT.detail}>
                  <span className="font-medium">{r.label}</span> · {r.detail}
                </p>
              ))}
              {m.selected.night && (
                <p className={TEXT.detail}>
                  At night (14 CFR 1.1)
                  {m.selected.night_passengers
                    ? "; with passengers, three full-stop landings in the last 90 days in 61.57(b)'s night period"
                    : ""}
                </p>
              )}
              <p className={cn(TEXT.detail, "text-muted-foreground")} data-testid="departure-window-figures">
                {hourFigures(m.selected, m.airplane)}
              </p>
            </div>
          )}
        </>
      )}
    </PillSection>
  );
}
