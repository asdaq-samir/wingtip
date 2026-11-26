import { useRef, type CSSProperties, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { FIGURE_SIZE, FIXED_FIGURE, FLYING_FIGURE, GROUP_HEADING, GROW_FIGURE, PIN_FIGURE } from "../lib/text";
import Explain from "./Explain";
import FigureWait from "./FigureWait";
import { useFiguresFit } from "./useFiguresFit";
import type { ExplainedTerm } from "../lib/explain";

export interface StripFigure {
  name: string;
  /** The name as shown where it is not the name itself ("Distance"). */
  label?: string;
  value: string;
  unit?: string;
  testId?: string;
  /** Short of what it must be (the fuel past the tanks), or wrong (a
   *  destination not known): a warning mark before it, red where it is not a button. */
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
export type StripSize = "fixed" | "grow" | "flying" | "pin";

const TYPE: Record<StripSize, { value: string; unit: string; name?: string; unitScale: number }> = {
  fixed: FIXED_FIGURE,
  grow: GROW_FIGURE,
  flying: FLYING_FIGURE,
  pin: PIN_FIGURE,
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
 * 17.88 and 19.65 keep four), as the iPhone's and Android's strips stack.
 * Every figure at its full size, never shrunk to fit (the owner,
 * 2026-11-21, at 19.65 px: "1,320 nm" and "⚠ 111.3 gal" read smaller than
 * "262 nm" and "23.1 gal"): the columns are as wide as their content, the
 * first flush left and the last flush right with the rest spread between,
 * and only where even that is too wide is a figure cut short with "…",
 * the figures always exact, never a rounded form in their place.
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
  still = false,
  row = false,
}: {
  figures: StripFigure[];
  size?: StripSize;
  testId?: string;
  tap?: (figure: StripFigure, face: ReactNode) => ReactNode;
  /** No roll as a figure changes: in flight the GPS's figures change every
   *  second, and a roll on each blurred them all the time (the motion
   *  review of 2026-11-22). */
  still?: boolean;
  /** One row whatever the width, never two by two: a bar one row high
   *  (FPL's pill), where figures are dropped from the end until the rest
   *  fit at full size, never one cut short. */
  row?: boolean;
}) {
  const type = TYPE[size];
  const roll = still ? undefined : "figure-roll";
  // Two by two where the figures do not fit across at their full size
  // (useFiguresFit), as below 16 rem: never one cut short (the HIG audit
  // of 2026-11-23, H2).
  const strip = useRef<HTMLDListElement>(null);
  const fitting = useFiguresFit(strip, figures.map((f) => `${f.label ?? f.name}${f.value}${f.unit ?? ""}`).join("|"));
  const fits = fitting >= figures.length;
  const fit = row || fits;
  // One row that does not hold them all at full size: figures dropped from
  // the end until the rest fit, rather than any cut short with "…" (the r7
  // audit's W-M3, at the owner's 17.88 and 19.65 px on a 375-point iPhone;
  // the r8 audit's W-L2, three at 320 points in Slide Over), one kept
  // whatever. Those dropped stay laid out, out of the grid and out of
  // sight, so what the strip needs is measured the same and the row never
  // flips between counts.
  const shown = row && !fits ? Math.max(1, fitting) : figures.length;
  const dropped = (i: number) => i >= shown;
  const last = shown - 1;
  // As many columns as figures shown, so none ever wraps onto a row of its
  // own (in flight the GPS altitude, a fifth figure in four columns, went
  // under the rest, and the pill showed that row alone).
  const cols = { "--cols": shown } as CSSProperties;
  return (
    <div className="@container/figures relative" data-slot="section-summary">
      <dl
        ref={strip}
        // At least a rem between two figures (16 points, 20 at the owner's
        // larger text), where 8 let them close in to crowd at a large text
        // size before one was dropped (the owner, 2026-11-26: "The
        // proportionality of gaps at small size and large size");
        // useFiguresFit reads it, so a figure drops sooner instead.
        className={cn(
          "grid justify-between gap-x-4 gap-y-3",
          "grid-cols-[repeat(var(--cols),minmax(0,max-content))]",
          !row && "@max-[16rem]/figures:grid-cols-2",
          !fit && "grid-cols-2",
        )}
        style={cols}
        data-testid={testId}
        data-stacked={!fit || undefined}
      >
        {figures.map((f, i) => {
          // The first figure flush with the strip's leading edge and the
          // last with its trailing one, the rest centred in their columns,
          // so the figures span the sheet's whole width (the owner,
          // 2026-11-20: "Why aren't we using the full width for the figures
          // at the bottom?"), where each centred in its fifth left the ends
          // inset. Not in the two-column stack of a narrow strip.
          const edge = fit && last > 1 && (i === 0 ? "start" : i === last ? "end" : null);
          const button = tap?.(
            f,
            <>
              {/* Short said by a mark too, not the red alone (WCAG 1.4.1). */}
              {f.alert && <TriangleAlert className="mr-0.5 size-[0.8em] shrink-0 self-center" aria-hidden data-testid="fuel-short-mark" />}
              {/* The value and its unit one run, cut at its end as iOS cuts
                  a label ("114.2 g…"), the figure kept whole the longest,
                  where the value alone was cut before its unit ("11… gal"). */}
              <span className="min-w-0 truncate">
                <span key={f.value} className={roll} data-figure="" data-fitted="">
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
            // Each column as wide as its widest of name and figure.
            <div
              key={f.name}
              inert={dropped(i) || undefined}
              aria-hidden={dropped(i) || undefined}
              className={cn(
                "min-w-0 text-center",
                dropped(i) && "invisible absolute",
                edge === "start" && "@min-[16rem]/figures:text-left",
                edge === "end" && "@min-[16rem]/figures:text-right",
              )}
            >
              {/* Its names and units a grey that reads on the pill's glass
                  over any chart (WCAG's 4.5:1), where the muted one did not;
                  its names in sentence case, short words ("Distance"), not a
                  section's capitals (the owner's list, 2026-11-17).
                  To a screen reader the figure in full words, here or as its
                  button's name. */}
              {/* A name that explains itself (ETE, ETA) does not clip, as a
                  button's dd does not, so its 44-point area reaches past
                  its line (the HIG audit of 2026-11-23, L3); its words are
                  one short abbreviation, nothing to cut. */}
              <dt
                className={cn(
                  GROUP_HEADING,
                  type.name,
                  f.explain ? "overflow-visible whitespace-nowrap" : "truncate",
                  "tracking-normal normal-case text-foreground/65",
                )}
              >
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
                  FIGURE_SIZE,
                  "truncate font-semibold tabular-nums",
                  button && "overflow-visible",
                  // A figure that is not a button said wrong in red, its
                  // mark before it (a destination not known, TripFigures).
                  !button && f.alert && "inline-flex w-full items-baseline justify-center text-destructive",
                  !button && f.alert && edge === "start" && "@min-[16rem]/figures:justify-start",
                  !button && f.alert && edge === "end" && "@min-[16rem]/figures:justify-end",
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
                      <span key={f.value} aria-hidden={f.said ? true : undefined} className={roll} data-figure="" data-fitted="">
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
