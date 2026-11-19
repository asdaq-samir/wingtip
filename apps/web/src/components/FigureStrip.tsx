import type { CSSProperties, ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { FIT, FIXED_FIGURE, FLYING_FIGURE, GROUP_HEADING, GROW_FIGURE } from "../lib/text";
import { figureRoom } from "./figureRoom";
import Explain from "./Explain";
import FigureWait from "./FigureWait";
import type { ExplainedTerm } from "../lib/explain";

export interface StripFigure {
  name: string;
  /** The name as shown where it is not the name itself ("Distance"). */
  label?: string;
  value: string;
  unit?: string;
  testId?: string;
  /** Short of what it must be (the fuel past the tanks), or wrong (a
   *  destination not known): a warning mark before it, which figureRoom
   *  leaves room for, and red where it is not a button. */
  alert?: boolean;
  /** The figure as a screen reader says it, name and all ("Distance, one
   *  hundred two point four nautical miles"), the shorthand hidden from
   *  it: "Dist 102.4 nm" was read as letters. */
  said?: string;
  /** Still coming (the nav log not in yet): its shape, not a dash, which
   *  means only "needs an airplane" (FigureWait; decision 0045). */
  waiting?: boolean;
  /** What a tap on its name explains (lib/explain), where it has one. */
  explain?: ExplainedTerm;
}

/** How large the figures are: `fixed` a heading's 20 under its rows (FPL's
 *  route row), `grow` from the pill's size to their own with the sheet
 *  (GROW_FIGURE: MapPanel's --sheet-progress, small at half, full at the
 *  pill and all the way up; the owner, 2026-11-05), `flying` one large
 *  size whatever the sheet's (FLYING_FIGURE, useFlyingMode). */
export type StripSize = "fixed" | "grow" | "flying";

const TYPE: Record<StripSize, { value: string; unit: string; name?: string; unitScale: number }> = {
  fixed: FIXED_FIGURE,
  grow: GROW_FIGURE,
  flying: FLYING_FIGURE,
};

/**
 * The one strip of figures pinned at a sheet's foot, in every state:
 * FPL's flight figures on the ground, in a dry run and in flight
 * (features/navlog's TripFigures, which makes some of them buttons), and the
 * training page's (how far the rating has got, the model's error), at the
 * owner's pick of the dev page's redesign ("redesign the dev similar
 * way"). Each figure its name over its value, centred in its column at the
 * owner's ask ("Can the calculations be center aligned?"); two by two
 * where the strip is under 16 rem wide, which with every rem grown is an
 * accessibility text size (24 px a rem and up on a phone; the owner's
 * 17.88 and 19.65 keep four), as the iPhone's and Android's strips stack:
 * four columns then cut the figures. Fitted as iOS fits a label to its
 * width: all of them set smaller together where the widest does not fit
 * its column, down to 0.7 of their size, and past that cut short with
 * "…" -- the figures always exact, never a rounded form in their place
 * (lib/text's FIT, each column a container; the trial of 2026-11-17,
 * where they were measured in the page and the one too wide rounded,
 * "13h 38m" read "13.6h"). It was two components, FlightLine and this,
 * each with its own grid and type.
 *
 * `tap` makes a figure a button: given the figure and its face (the mark,
 * the value and the unit, sized to fit), it returns the button round the
 * face, or null where that figure is not one. A button's dd does not
 * clip, so its 44-point area (the button's after) reaches past it rather
 * than being cut off (the FPL audit's A17); the figure in it is cut short
 * instead.
 */
export default function FigureStrip({
  figures,
  size = "grow",
  testId,
  tap,
}: {
  figures: StripFigure[];
  size?: StripSize;
  testId?: string;
  tap?: (figure: StripFigure, face: ReactNode) => ReactNode;
}) {
  const type = TYPE[size];
  // As many columns as figures, so none ever wraps onto a row of its own
  // (in flight the GPS altitude, a fifth figure in four columns, went under
  // the rest, and the pill showed that row alone).
  const room = { "--fit-room": figureRoom(figures, type.unitScale), "--cols": figures.length } as CSSProperties;
  return (
    <div className="@container/figures relative" data-slot="section-summary">
      <dl
        className={cn("grid gap-3", "grid-cols-[repeat(var(--cols),minmax(0,1fr))]", "@max-[16rem]/figures:grid-cols-2")}
        style={room}
        data-testid={testId}
      >
        {figures.map((f) => {
          const button = tap?.(
            f,
            <>
              {/* Short said by a mark too, not the red alone (WCAG 1.4.1). */}
              {f.alert && <TriangleAlert className="mr-0.5 size-[0.8em] shrink-0 self-center" aria-hidden data-testid="fuel-short-mark" />}
              {/* The value and its unit one run, cut at its end as iOS cuts
                  a label ("114.2 g…"), the figure kept whole the longest,
                  where the value alone was cut before its unit ("11… gal"). */}
              <span className="min-w-0 truncate">
                <span key={f.value} className="figure-roll" data-fitted="">
                  {f.waiting ? <FigureWait /> : f.value}
                </span>
                {/* Its space a no-break one: a flex item drops a leading
                    plain one, and it read "16.6gal" (the owner's screenshot,
                    2026-11-06). */}
                {f.unit && (
                  <span className={cn(type.unit, "font-normal")} data-fitted="">
                    {" "}
                    {f.unit}
                  </span>
                )}
              </span>
            </>,
          );
          return (
            // Each column a container, so the figure's size is worked out
            // from its own width (FIT's 100cqi), the same in every column.
            <div key={f.name} className="@container min-w-0 text-center">
              {/* Its names and units a grey that reads on the pill's glass
                  over any chart (WCAG's 4.5:1), where the muted one did not;
                  its names in sentence case, short words ("Distance"), not a
                  section's capitals (the owner's list, 2026-11-17).
                  To a screen reader the figure in full words, here or as its
                  button's name. */}
              <dt className={cn(GROUP_HEADING, type.name, "truncate tracking-normal normal-case text-foreground/65")}>
                {f.explain ? (
                  <Explain term={f.explain} spoken={f.label ?? f.name} className="text-inherit">
                    {f.label ?? f.name}
                  </Explain>
                ) : (
                  <span aria-hidden={f.said ? true : undefined}>{f.label ?? f.name}</span>
                )}
                {f.said && !button && <span className="sr-only">{f.said}</span>}
              </dt>
              <dd
                className={cn(
                  type.value,
                  FIT,
                  "truncate font-semibold tabular-nums",
                  button && "overflow-visible",
                  // A figure that is not a button said wrong in red, its
                  // mark before it (a destination not known, TripFigures).
                  !button && f.alert && "inline-flex w-full items-baseline justify-center text-destructive",
                )}
                data-testid={f.testId}
                data-alert={(!button && f.alert) || undefined}
              >
                {button ?? (
                  <>
                    {f.alert && (
                      <TriangleAlert className="mr-0.5 size-[0.8em] shrink-0 self-center" aria-hidden data-testid="figure-alert-mark" />
                    )}
                    <span className={cn(f.alert && "min-w-0 truncate")}>
                      <span key={f.value} aria-hidden={f.said ? true : undefined} className="figure-roll" data-fitted="">
                        {f.waiting ? <FigureWait /> : f.value}
                      </span>
                      {f.unit && (
                        <span
                          aria-hidden={f.said ? true : undefined}
                          className={cn(type.unit, "font-normal text-foreground/65")}
                          data-fitted=""
                        >
                          {" "}
                          {f.unit}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
