import { Moon } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../components/Favorites";
import FindingIcon from "../../components/FindingIcon";
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
 * "When should I go?" in the Brief, under the verdict and the assistant's
 * field: an hour-by-hour strip across as far as the forecasts reach, each
 * hour go, caution, no-go or not known by the Brief's own Go / No-Go for
 * a flight leaving then, the best window said over it ("Best: 07:00–10:00
 * CST"), and a tap on an hour opening why, with its time and fuel. Its
 * state is useDepartureWindow's.
 */
export default function DepartureWindowStrip() {
  const m = useDepartureWindow();
  if (!m.shown) return null;
  const now = new Date();
  const title = m.best ? bestLine(m.best, now) : "When to go";
  return (
    <PillSection title={title} testId="departure-window">
      {!m.signedIn ? (
        <p className={cn(TEXT.detail, "text-muted-foreground")} data-testid="departure-window-sign-in">
          Sign in to see the hours to go across the next day.
        </p>
      ) : m.error ? (
        // Where it happened, not a toast (lib/problems).
        <FieldError className={cn(TEXT.detail, "text-muted-foreground")} data-testid="departure-window-error">
          Hours unavailable: {describeError(m.error, "the planner did not answer")}
        </FieldError>
      ) : m.pending ? (
        <div className="flex gap-2" aria-busy="true" data-testid="departure-window-pending">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-12 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : m.hours.length === 0 ? (
        <p className={cn(TEXT.detail, "text-muted-foreground")} data-testid="departure-window-none">
          No TAF along the route reaches past the next hour.
        </p>
      ) : (
        <>
          {!m.best && (
            <p className={cn(TEXT.detail, "text-muted-foreground")} data-testid="departure-window-no-go">
              No hour with nothing against it before {clock(m.hours.at(-1)!.depart)}.
            </p>
          )}
          {/* Across, as far as the forecasts reach: the strip scrolls,
              the page does not. The stock ToggleGroup, one hour at most
              picked (Base UI's single selection, its arrow keys along the
              strip; the owner, 2026-11-10), where the tiles were buttons
              of our own. Each tile's hit area is 44 points by its
              pseudo-element, the tiles gap-2 apart so the areas meet. */}
          <ToggleGroup
            value={m.selected ? [m.selected.depart] : []}
            onValueChange={(value) => m.pick(value[0] ?? null)}
            aria-label="Departure hours"
            className="-mx-4 w-auto snap-x overflow-x-auto overscroll-x-contain px-4 pb-1"
            data-testid="departure-window-hours"
          >
            {m.hours.map((h) => {
              const finding = HOUR_FINDING[h.verdict];
              const day = dayOf(h.depart, now);
              return (
                <ToggleGroupItem
                  key={h.depart}
                  value={h.depart}
                  aria-label={hourLabel(h)}
                  data-testid="departure-window-hour"
                  data-verdict={h.verdict}
                  className={cn(
                    "relative h-auto w-12 snap-start flex-col gap-0.5 rounded-xl py-1.5",
                    "after:absolute after:-inset-1 data-pressed:ring-2 data-pressed:ring-tint",
                    TILE_TINT[finding],
                  )}
                >
                  <span className={cn(TEXT.detail, "tabular-nums text-foreground")}>{clock(h.depart).slice(0, 2)}</span>
                  <FindingIcon finding={finding} className="size-5" />
                  {h.night ? <Moon className="size-3 text-muted-foreground" aria-hidden /> : <span className="h-3" aria-hidden />}
                  {day && <span className="sr-only">{day}</span>}
                </ToggleGroupItem>
              );
            })}
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
