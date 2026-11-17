import { Button as BaseButton } from "@base-ui/react/button";
import { useAirplaneChosen } from "../../../lib/preferences";
import { Suspense, lazy, useState, type ReactNode } from "react";
import { zoneName } from "../../../lib/format";
import { cn } from "cn";
import type { Totals } from "../../../lib/api/types";
import FigureStrip, { type StripFigure } from "../../../components/FigureStrip";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../components/ResponsivePopover";
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
 *
 * Drawn by the one FigureStrip, in every state -- FPL's route row, a dry
 * run and in flight -- this saying only what the figures are and which of
 * them a tap changes; it was FlightLine, a strip of its own beside it.
 */

/** A figure as it is seen, first in its button's name (WCAG 2.5.3, Label
 *  in Name), the words said for it after: "102 nm, Distance, …". */
const seen = (f: { value: string; unit?: string }) => (f.unit ? `${f.value} ${f.unit}` : f.value);

/** A figure's button, the figure itself in the tint as what is tapped is,
 *  its 44-point area round it (the after), the figure not grown to make it. */
const AREA = "relative max-w-full after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";

export default function TripFigures({
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
  /** At the sheet's foot: small at half and their full size at the pill
   *  and all the way up (FigureStrip's `grow`). */
  grow?: boolean;
  /** A dry run flying: the same figures from where the airplane is
   *  (tripFigures' `flown`), the same taps on them. */
  flown?: Flown | null;
  /** In flight (useFlyingMode): the figures one large size whatever the
   *  sheet's (FigureStrip's `flying`), over `grow`. */
  flying?: boolean;
  /** The planner's first suggested fuel stop for a flight longer than the
   *  tanks (useSuggestedStops), offered under the fuel's breakdown where
   *  the figure says it is short, as the route box offers it in FPL. */
  fuelStop?: { idents: string[]; add: () => void } | null;
}) {
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
  // A dry run's figures keep the strip's own format, set smaller to fit
  // rather than rounded ("1.2h", "102 nm" in the run against "1h 14m",
  // "105.1 nm" in the plan, the FPL audit's A20; the owner's one strip).
  // No airplane picked: the route's own figures alone, To and Dist --
  // the time and the fuel are an airplane's, and none is assumed (the
  // owner, 2026-11-08: "only show the distance and the things you can
  // without airplane profile, don't assume").
  const airplane = useAirplaneChosen();
  const ours = (whole: boolean): StripFigure[] =>
    tripFigures(input, whole)
      .filter((f) => airplane || f.name === "To" || f.name === "Dist")
      // The fuel named as what it is, the fuel required (the legs, the
      // start and taxi, the reserve): beside the route's rows' fuel in the
      // tanks, "Fuel" read as the fuel burnt, 16.6 against the 13 gone
      // from 40 to 27 (the owner's screenshot, 2026-11-06).
      .map((f) => ({ ...f, label: f.name === "Fuel" ? "Fuel req" : f.name === "ETA" ? `ETA ${zoneName()}` : f.name }));
  // The fuel required tapped, what it is made of (FuelBreakdown), at the
  // owner's ask ("fuel is the fuel required which gives a breakdown when
  // tapped"): once the nav log's figures are in.
  const next = nextLanding(totals, destination, flown?.hop);
  const breakdown = next.totals?.fuel_required_gal != null ? next : null;
  const tap = (f: StripFigure, face: ReactNode): ReactNode => {
    const said = f.said ?? f.name;
    if (f.name === "Fuel" && breakdown)
      return (
        <ResponsivePopover open={breakdownOpen} onOpenChange={setBreakdownOpen}>
          <ResponsivePopoverTrigger asChild>
            <BaseButton
              data-testid="fuel-breakdown-open"
              data-alert={f.alert || undefined}
              aria-label={`${seen(f)}, ${said}: what it is made of`}
              className={cn(AREA, "inline-flex items-baseline", f.alert ? "text-destructive" : "text-tint")}
            >
              {face}
            </BaseButton>
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
      );
    if (f.name === "To" && stops && !local)
      return (
        <Button
          variant="link"
          size="inline"
          onClick={() => setToDestination(!toDestination)}
          data-testid="to-toggle"
          aria-label={`${said}: show the ${toDestination ? "next stop" : "destination"}`}
          className={AREA}
        >
          {face}
        </Button>
      );
    // The distance opens the nav log it is the sum of, leg by leg (tap
    // what you see, docs/navigation.md).
    if (f.name === "Dist" && !local && !flown)
      return (
        <Button
          variant="link"
          size="inline"
          onClick={() => wantScreen("navlog")}
          data-testid="dist-navlog"
          aria-label={`${seen(f)}, ${said}: open the nav log`}
          className={cn(AREA, "items-baseline")}
        >
          {face}
        </Button>
      );
    if ((f.name === "ETE" || f.name === "ETA") && !local)
      return (
        <Button
          variant="link"
          size="inline"
          onClick={() => setArrival(!arrival)}
          data-testid="ete-eta-toggle"
          aria-label={`${seen(f)}, ${said}: show the ${f.name === "ETE" ? "arrival" : "time en route"}`}
          className={AREA}
        >
          {face}
        </Button>
      );
    return null;
  };
  // What the planner is working on is the toast's (useProgressToast), at
  // the pilot's ask: the strip keeps the figures, as soon as there are
  // any, and with none yet their names over dashes -- it keeps its place,
  // as the panel's controls do.
  return <FigureStrip figures={ours(false)} rounded={ours(!flown)} size={flying ? "flying" : grow ? "grow" : "fixed"} tap={tap} />;
}
