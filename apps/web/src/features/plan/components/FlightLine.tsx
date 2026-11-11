import { useAirplaneChosen } from "../../../lib/preferences";
import { Suspense, lazy, useState } from "react";
import { zoneName } from "../../../lib/format";
import { cn } from "cn";
import type { Totals } from "../../../lib/api/types";
import { FLYING_FIGURE, GROUP_HEADING, GROW_FIGURE, TEXT } from "../../../lib/text";
import { useFigureFit } from "../../../components/useFigureFit";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../components/ResponsivePopover";
import { TriangleAlert } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { nextLanding, shortFlights, tripFigures } from "../figures";
import { wantScreen } from "../../../lib/navigation/wanted";
import type { Flown } from "./navlog/dryRun";

/** What the fuel is made of, from the figure's first tap: its own chunk,
 *  off the first load (scripts/first-load.mjs's budget). */
const FuelBreakdown = lazy(() => import("./FuelBreakdown"));

/**
 * The flight's figures, the last of the route's panel over the tabs, at
 * the pilot's ask: the quick figures read with the route -- the distance,
 * the time en route, the arrival and the fuel -- the detail under the
 * tabs. A strip of them as ForeFlight's is, each figure large under its
 * name in the nav log's shorthand ("DIST", "ETE"), at the pilot's ask,
 * where they were one grey line ("Dist 323.6 nm · ETA 17:07 (2h 45m) ·
 * Fuel 23.4 gal") read past at a glance. The arrival from the departure
 * time picked, or from now while it is "Now"; one airport to itself, the
 * time aloft and the time back. Where no legal altitude can be had, the
 * figures stay -- the book's, marked "≈" -- and why is the Brief's (its Go
 * / No-Go, red) and the altitude chip's, at the pilot's ask: in red in the
 * strip's place, it hid the distance, the time and the fuel.
 *
 * Each figure as it is while it fits its column; where one does not (a
 * long trip's "2636.8 nm" at a large text size, an iPhone SE's narrow
 * columns), that one rounded: the distance and the fuel up to whole ones,
 * the time en route in decimal hours, at the pilot's ask -- up, so none
 * is ever said short of what it is. Where a rounded one still does not
 * fit (Chicago to Las Vegas, over 1,300 nm, its distance, time and fuel
 * cut to "131…", "≈12.…" and "≈10…" on an iPhone set to a larger text
 * size, which the app follows (features/shell/dynamicType), 2026-10-11), the four
 * are set smaller together, figures and units, as iOS shrinks a label to
 * fit its width (UILabel's adjustsFontSizeToFitWidth), down to three
 * quarters -- 15 points at the default size, the body's -- and only past
 * that cut short (useFigureFit, a dry run's strip's too).
 */

/** The figures, their units and their names from the pill's size (the
 *  detail's 15, a caption's 11) to their own (the heading's 20, a note's
 *  13), with the sheet (`grow`); TEXT's sizes, a mouse's and a finger's. */
const { value: GROW_VALUE, unit: GROW_UNIT, name: GROW_NAME } = GROW_FIGURE;

/** A figure as it is seen, first in its button's name (WCAG 2.5.3, Label
 *  in Name), the words said for it after: "102 nm, Distance, …". */
const seen = (f: { value: string; unit?: string }) => (f.unit ? `${f.value} ${f.unit}` : f.value);

export default function FlightLine({
  totals,
  estimate,
  destination,
  depart,
  local,
  grow = false,
  flown = null,
  flying = false,
  fuelStop = null,
}: {
  totals: Totals | null;
  /** Before the nav log's totals, at the pilot's ask for the figures as
   *  soon as can be: the course's distance at once, and the time and fuel
   *  from the airplane's book cruise speed and burn over it -- no wind,
   *  climb or reserve, so the time and the fuel marked "≈" until the nav
   *  log's own come. */
  estimate?: { distanceNm: number; cruiseTasKt: number | null; fuelBurnGph: number | null } | null;
  /** The route's destination: the To of a route with no stops. */
  destination: string;
  /** The departure time picked, ISO; empty for now: the ETA's. */
  depart: string;
  /** One airport to itself: the time aloft and the time back. */
  local: boolean;
  /** Pinned at the sheet's foot at every height: small at half, under the
   *  list, and their full size at the pill and all the way up (the owner,
   *  2026-11-05: "when in small detent, the font should become larger size
   *  as in large detent"), eased between as the sheet moves -- by
   *  MapPanel's --sheet-progress, 0 at half, 1 at the other two. */
  grow?: boolean;
  /** A dry run flying: the same figures from where the airplane is
   *  (tripFigures' `flown`), the same taps on them. */
  flown?: Flown | null;
  /** In flight (useFlyingMode): the figures one large size whatever the
   *  sheet's (FLYING_FIGURE), over `grow`. */
  flying?: boolean;
  /** The planner's first suggested fuel stop for a flight longer than the
   *  tanks (useSuggestedStops), offered under the fuel's breakdown where
   *  the figure says it is short, as the route box offers it in FPL. */
  fuelStop?: { idents: string[]; add: () => void } | null;
}) {
  const valueType = flying ? FLYING_FIGURE.value : grow ? GROW_VALUE : TEXT.heading;
  const unitType = flying ? FLYING_FIGURE.unit : grow ? GROW_UNIT : TEXT.note;
  const nameType = flying ? FLYING_FIGURE.name : grow ? GROW_NAME : undefined;
  // The time en route tapped, the arrival's clock time in its place, and
  // back, at the owner's ask ("Ete should change to eta when tapped").
  const [arrival, setArrival] = useState(false);
  // To tapped on a route with stops, the destination in the next stop's
  // place, and back, at the owner's ask ("To should change to next stop
  // or destination").
  const [toDestination, setToDestination] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const stops = (totals?.hops.length ?? 0) > 0;
  const input = { totals, estimate, local, destination, depart, arrival, toDestination: stops && toDestination, flown };
  const exact = tripFigures(input, false);
  // A dry run's figures keep the strip's own format, set smaller to fit
  // rather than rounded ("1.2h", "102 nm" in the run against "1h 14m",
  // "105.1 nm" in the plan, the FPL audit's A20; the owner's one strip).
  const rounded = tripFigures(input, !flown);
  // The fuel required tapped, what it is made of (FuelBreakdown), at the
  // owner's ask ("fuel is the fuel required which gives a breakdown when
  // tapped"): once the nav log's figures are in.
  const next = nextLanding(totals, destination, flown?.hop);
  const breakdown = next.totals?.fuel_required_gal != null ? next : null;
  // Each figure on its own: the one too wide for its column rounded, the
  // rest as they are, and set smaller together where that is not enough
  // (useFigureFit).
  // No airplane picked: the route's own figures alone, To and Dist --
  // the time and the fuel are an airplane's, and none is assumed (the
  // owner, 2026-11-08: "only show the distance and the things you can
  // without airplane profile, don't assume").
  const airplane = useAirplaneChosen();
  const ours = (fs: typeof exact) => (airplane ? fs : fs.filter((f) => f.name === "To" || f.name === "Dist"));
  const { room, shown, sized, fitted, probes } = useFigureFit(ours(exact), ours(rounded), valueType, unitType);
  // Which figures are buttons (below), each its 44-point area round it.
  const tapped = (name: string) =>
    (name === "Fuel" && !!breakdown) ||
    (name === "To" && stops && !local) ||
    ((name === "ETE" || name === "ETA") && !local) ||
    (name === "Dist" && !local && !flown);
  return (
    // What the planner is working on is the toast's (useProgressToast), at
    // the pilot's ask: the strip keeps the figures, as soon as there are
    // any, and with none yet their names over dashes -- it keeps its
    // place, as the panel's controls do.
    <div className="@container/figures relative" data-slot="section-summary">
      {/* Each figure centred in its column, at the owner's ask ("Can the
          calculations be center aligned?"), as FigureStrip's are. Two by
          two where the strip is under 16 rem wide, which with every rem
          grown is an accessibility text size (24 px a rem and up on a
          phone; the owner's 17.88 and 19.65 keep four), as the iPhone's
          and Android's strips stack: four columns then cut the figures. */}
      <dl
        className={cn(
          "grid gap-3",
          shown.length === 2 ? "grid-cols-2" : shown.length === 3 ? "grid-cols-3" : "grid-cols-4",
          "@max-[16rem]/figures:grid-cols-2",
        )}
      >
        {shown.map((f, i) => (
          <div key={f.name} className="min-w-0 text-center">
            {/* Its names and units a grey that reads on the pill's glass
                over any chart (WCAG's 4.5:1), where the muted one did not. */}
            {/* The fuel named as what it is, the fuel required (the legs, the
                start and taxi, the reserve): beside the route's rows' fuel in
                the tanks, "Fuel" read as the fuel burnt, 16.6 against the 13
                gone from 40 to 27 (the owner's screenshot, 2026-11-06). */}
            {/* To a screen reader the figure in full words, name and all
                (tripFigures' said), here or as its button's name, the
                shorthand hidden from it: "Dist 102.4 nm" was read as
                letters. */}
            <dt className={cn(GROUP_HEADING, nameType, "truncate text-foreground/65")}>
              <span aria-hidden>{f.name === "Fuel" ? "Fuel req" : f.name === "ETA" ? `ETA ${zoneName()}` : f.name}</span>
              {!tapped(f.name) && <span className="sr-only">{f.said}</span>}
            </dt>
            {/* Where the figure is a button, the dd does not clip: its
                44-point area (the button's after) reached past it and was
                cut off, so a tap 11 points over ETE or Fuel at half landed
                on the name (the FPL audit's A17). The figure itself is cut
                short instead (its own truncate). */}
            <dd
              ref={i === 0 ? room : undefined}
              className={cn(valueType, "truncate font-semibold tabular-nums", tapped(f.name) && "overflow-visible")}
              data-testid={f.testId}
            >
              {f.name === "Fuel" && breakdown ? (
                <ResponsivePopover open={breakdownOpen} onOpenChange={setBreakdownOpen}>
                  <ResponsivePopoverTrigger asChild>
                    {/* The figure itself the button, in the tint as what is
                        tapped is; its 44-point area round it, the figure
                        not grown to make it (index.css's after). */}
                    <button
                      type="button"
                      data-testid="fuel-breakdown-open"
                      data-alert={f.alert || undefined}
                      aria-label={`${seen(f)}, ${f.said}: what it is made of`}
                      className={cn(
                        "relative inline-flex max-w-full items-baseline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']",
                        f.alert ? "text-destructive" : "text-tint",
                      )}
                    >
                      {/* Short said by a mark too, not the red alone (WCAG 1.4.1). */}
                      {f.alert && <TriangleAlert className="mr-0.5 size-[0.8em] self-center" aria-hidden data-testid="fuel-short-mark" />}
                      <span key={f.value} className="figure-roll min-w-0 truncate" style={sized("value")} data-fitted={fitted}>
                        {f.value}
                      </span>
                      {/* Its space a no-break one: a flex item drops a
                          leading plain one, and it read "16.6gal" (the
                          owner's screenshot, 2026-11-06). */}
                      {f.unit && (
                        <span className={cn(unitType, "font-normal")} style={sized("unit")} data-fitted={fitted}>
                          {"\u00a0"}
                          {f.unit}
                        </span>
                      )}
                    </button>
                  </ResponsivePopoverTrigger>
                  <ResponsivePopoverContent title={`Fuel to ${breakdown.to}`} className="w-72 p-3" side="top" align="end">
                    <Suspense fallback={null}>
                      <FuelBreakdown totals={breakdown.totals!} short={shortFlights(totals)} burnt={flown?.burntGal} />
                    </Suspense>
                    {f.alert && fuelStop && (
                      <Button
                        type="button"
                        variant="ghost"
                        data-testid="fuel-short-add-stop"
                        // Its 44-point area made by the after, the button not grown to it;
                        // the popover put away as the stop is kept, so a second tap cannot
                        // keep it again over figures that are changing.
                        className="relative mt-2 w-full text-tint after:absolute after:-inset-y-1 after:content-['']"
                        onClick={() => {
                          setBreakdownOpen(false);
                          fuelStop.add();
                        }}
                      >
                        Add fuel stop at {fuelStop.idents.join(", ")}
                      </Button>
                    )}
                  </ResponsivePopoverContent>
                </ResponsivePopover>
              ) : f.name === "To" && stops && !local ? (
                <button
                  type="button"
                  onClick={() => setToDestination(!toDestination)}
                  data-testid="to-toggle"
                  aria-label={`${f.said}: show the ${toDestination ? "next stop" : "destination"}`}
                  className="relative inline-flex max-w-full text-tint after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                >
                  <span key={f.value} className="figure-roll min-w-0 truncate" style={sized("value")} data-fitted={fitted}>
                    {f.value}
                  </span>
                </button>
              ) : f.name === "Dist" && !local && !flown ? (
                // The distance opens the nav log it is the sum of, leg by
                // leg (tap what you see, docs/navigation.md).
                <button
                  type="button"
                  onClick={() => wantScreen("navlog")}
                  data-testid="dist-navlog"
                  aria-label={`${seen(f)}, ${f.said}: open the nav log`}
                  className="relative inline-flex max-w-full items-baseline text-tint after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                >
                  <span key={f.value} className="figure-roll min-w-0 truncate" style={sized("value")} data-fitted={fitted}>
                    {f.value}
                  </span>
                  {f.unit && (
                    <span className={cn(unitType, "font-normal")} style={sized("unit")} data-fitted={fitted}>
                      {"\u00a0"}
                      {f.unit}
                    </span>
                  )}
                </button>
              ) : (f.name === "ETE" || f.name === "ETA") && !local ? (
                <button
                  type="button"
                  onClick={() => setArrival(!arrival)}
                  data-testid="ete-eta-toggle"
                  aria-label={`${seen(f)}, ${f.said}: show the ${f.name === "ETE" ? "arrival" : "time en route"}`}
                  className="relative inline-flex max-w-full text-tint after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                >
                  <span key={f.value} className="figure-roll min-w-0 truncate" style={sized("value")} data-fitted={fitted}>
                    {f.value}
                  </span>
                </button>
              ) : (
                <>
                  <span key={f.value} aria-hidden className="figure-roll" style={sized("value")} data-fitted={fitted}>
                    {f.value}
                  </span>
                  {f.unit && (
                    <span aria-hidden className={cn(unitType, "font-normal text-foreground/65")} style={sized("unit")} data-fitted={fitted}>
                      {" "}
                      {f.unit}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {probes}
    </div>
  );
}
