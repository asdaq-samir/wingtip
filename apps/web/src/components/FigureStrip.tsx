import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { FLYING_FIGURE, GROUP_HEADING, GROW_FIGURE, TEXT } from "../lib/text";
import { useFigureFit } from "./useFigureFit";

export interface StripFigure {
  name: string;
  /** The name as shown where it is not the name itself ("Fuel req"). */
  label?: string;
  value: string;
  unit?: string;
  testId?: string;
  /** Short of what it must be (the fuel past the tanks), or wrong (a
   *  destination not known): a warning mark before it, which useFigureFit
   *  leaves room for, and red where it is not a button. */
  alert?: boolean;
  /** The figure as a screen reader says it, name and all ("Distance, one
   *  hundred two point four nautical miles"), the shorthand hidden from
   *  it: "Dist 102.4 nm" was read as letters. */
  said?: string;
}

/** How large the figures are: `fixed` a heading's 20 under its rows (FPL's
 *  route row), `grow` from the pill's size to their own with the sheet
 *  (GROW_FIGURE: MapPanel's --sheet-progress, small at half, full at the
 *  pill and all the way up; the owner, 2026-11-05), `flying` one large
 *  size whatever the sheet's (FLYING_FIGURE, useFlyingMode). */
export type StripSize = "fixed" | "grow" | "flying";

const TYPE: Record<StripSize, { value: string; unit: string; name?: string }> = {
  fixed: { value: TEXT.heading, unit: TEXT.note },
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
 * four columns then cut the figures. Each fitted to its column, rounded or
 * set smaller together where it does not fit (useFigureFit). It was two
 * components, FlightLine and this, each with its own grid and type.
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
  rounded = figures,
  size = "grow",
  testId,
  tap,
}: {
  figures: StripFigure[];
  /** Each figure rounded, for the one too wide for its column (useFigureFit). */
  rounded?: StripFigure[];
  size?: StripSize;
  testId?: string;
  tap?: (figure: StripFigure, face: ReactNode) => ReactNode;
}) {
  const type = TYPE[size];
  const { room, shown, sized, fitted, probes } = useFigureFit(figures, rounded, type.value, type.unit);
  return (
    <div className="@container/figures relative" data-slot="section-summary">
      <dl
        className={cn(
          "grid gap-3",
          shown.length === 2 ? "grid-cols-2" : shown.length === 3 ? "grid-cols-3" : "grid-cols-4",
          "@max-[16rem]/figures:grid-cols-2",
        )}
        data-testid={testId}
      >
        {shown.map((f, i) => {
          const button = tap?.(
            f,
            <>
              {/* Short said by a mark too, not the red alone (WCAG 1.4.1). */}
              {f.alert && <TriangleAlert className="mr-0.5 size-[0.8em] self-center" aria-hidden data-testid="fuel-short-mark" />}
              <span key={f.value} className="figure-roll min-w-0 truncate" style={sized("value")} data-fitted={fitted}>
                {f.value}
              </span>
              {/* Its space a no-break one: a flex item drops a leading
                  plain one, and it read "16.6gal" (the owner's screenshot,
                  2026-11-06). */}
              {f.unit && (
                <span className={cn(type.unit, "font-normal")} style={sized("unit")} data-fitted={fitted}>
                  {" "}
                  {f.unit}
                </span>
              )}
            </>,
          );
          return (
            <div key={f.name} className="min-w-0 text-center">
              {/* Its names and units a grey that reads on the pill's glass
                  over any chart (WCAG's 4.5:1), where the muted one did not.
                  To a screen reader the figure in full words, here or as its
                  button's name. */}
              <dt className={cn(GROUP_HEADING, type.name, "truncate text-foreground/65")}>
                <span aria-hidden={f.said ? true : undefined}>{f.label ?? f.name}</span>
                {f.said && !button && <span className="sr-only">{f.said}</span>}
              </dt>
              <dd
                ref={i === 0 ? room : undefined}
                className={cn(
                  type.value,
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
                    <span
                      key={f.value}
                      aria-hidden={f.said ? true : undefined}
                      className="figure-roll"
                      style={sized("value")}
                      data-fitted={fitted}
                    >
                      {f.value}
                    </span>
                    {f.unit && (
                      <span
                        aria-hidden={f.said ? true : undefined}
                        className={cn(type.unit, "font-normal text-foreground/65")}
                        style={sized("unit")}
                        data-fitted={fitted}
                      >
                        {" "}
                        {f.unit}
                      </span>
                    )}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {probes}
    </div>
  );
}
