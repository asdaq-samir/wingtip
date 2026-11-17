import { Button as BaseButton } from "@base-ui/react/button";
import { useAirplaneChosen } from "../../lib/preferences";
import { Suspense, lazy, useState, type ReactNode } from "react";
import { grouped, zoneName } from "../../lib/format";
import { useOwnFix } from "../../lib/map/position/ownShip";
import { cn } from "cn";
import type { ExplainedTerm } from "../../lib/explain";
import type { Totals } from "../../lib/api/types";
import FigureStrip, { type StripFigure } from "../../components/FigureStrip";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../components/ResponsivePopover";
import { Button } from "../../components/ui/button";
import { nextLanding, shortFlights, tripFigures, type Flown } from "../plan";
import { requestAirplanePick } from "../../lib/pickAirplane";

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
 * Each figure exact; where the widest does not fit its column (a long
 * trip's "13h 38m" at a larger text size, which the app follows
 * (features/shell/dynamicType), an iPhone SE's narrow columns), all of
 * them set smaller together, as iOS shrinks a label to fit its width,
 * down to 0.7 of their size, and only past that cut short (FigureStrip).
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
/** The strip's names as shown (FigureStrip's `label`). */
const LABEL: Record<string, string> = { Dist: "Distance", ETE: "Time", Fuel: "Fuel" };

/** The names a tap explains (components/Explain; decision 0044): the time
 *  en route, the arrival, the fuel required. */
const EXPLAIN: Record<string, ExplainedTerm> = { ETE: "ETE", ETA: "ETA", Fuel: "Fuel req" };

const AREA = "relative max-w-full after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";

/** A figure an airplane makes (the time, the fuel), with none picked: a
 *  dash, said as what it waits for. */
function wantsAirplane(f: StripFigure): StripFigure {
  const name = f.name === "Fuel" ? "Fuel required" : f.name === "ETA" ? "Arrival" : f.name === "Aloft" ? "Time aloft" : "Time en route";
  return { name: f.name, value: "—", said: `${name}: pick an airplane for it` };
}

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
  unknown = null,
}: {
  /** A point of the route the planner does not know (usePlan's
   *  `unknownPlace`): where it is the To, said so on it. */
  unknown?: string | null;
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
  // Nautical or statute miles, switched by a tap on the distance.
  const [statute, setStatute] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const stops = (totals?.hops.length ?? 0) > 0;
  const input = { totals, estimate, local, destination, depart, arrival, toDestination: stops && toDestination, flown, statute };
  // No airplane picked: the route's own figures alone, To and Dist --
  // the time and the fuel are an airplane's, and none is assumed (the
  // owner, 2026-11-08: "only show the distance and the things you can
  // without airplane profile, don't assume").
  // The four columns kept all the same, the time and the fuel a dash in
  // the tint that asks for an airplane (lib/pickAirplane), where the two
  // went and the strip said nothing of why (the UI audit's C2,
  // 2026-11-17): what the airplane would make of the route, none assumed.
  const airplane = useAirplaneChosen();
  // The phone's own GPS altitude at the strip's end while flying (or a dry
  // run flies own ship), the owner's ask (2026-11-17: "true altitude of the
  // phone from gps"): MSL as iOS's location gives it, to the nearest 10 ft,
  // since a GPS height wanders by tens of feet. Named "GPS" so it is never
  // read as the altimeter, which is what altitudes are flown and assigned by
  // (14 CFR 91.121); none on the ground or with no altitude in the fix.
  const fix = useOwnFix();
  const gpsFt = (flying || flown) && fix?.altitudeFt != null ? Math.round(fix.altitudeFt / 10) * 10 : null;
  const gps: StripFigure | null =
    gpsFt === null
      ? null
      : {
          name: "GPS",
          label: "GPS alt",
          value: grouped(gpsFt),
          unit: "ft",
          testId: "strip-gps-alt",
          said: `GPS altitude, ${grouped(gpsFt)} feet`,
        };
  const ours: StripFigure[] = [
    ...tripFigures(input)
      .map((f) => (airplane || f.name === "To" || f.name === "Dist" ? f : wantsAirplane(f)))
      // The destination the planner does not know, said on the figure in
      // red with its mark, the pill too, where the pill read "ZZZZ" over
      // a dash as if nothing were wrong (the UI audit's B8).
      .map((f) =>
        f.name === "To" && unknown && f.value.toUpperCase() === unknown.toUpperCase()
          ? { ...f, alert: true, said: `${f.said ?? f.value}, not a place we know` }
          : f,
      )
      // Each named in a short word in sentence case, "To", "Distance",
      // "Time", "Fuel" (the owner's list, 2026-11-17), where "TO / DIST /
      // ETE / FUEL REQ" were capitals and shorthand; the fuel is still the
      // fuel required, said so in its name to a screen reader and in its
      // breakdown (FuelBreakdown).
      .map((f) => ({ ...f, label: LABEL[f.name] ?? (f.name === "ETA" ? `Arrival ${zoneName()}` : f.name), explain: EXPLAIN[f.name] }))
      // An airplane's figure before the nav log's totals and with no
      // estimate is still coming: its shape, the dash kept for "needs an
      // airplane" (decision 0044).
      .map((f) => (airplane && !totals && f.value === "—" && f.name !== "To" ? { ...f, waiting: true } : f))
      // In flight (a dry run too) no To: the flying head over the map names
      // the next point, and the strip keeps four columns for the distance,
      // the time, the fuel and the GPS altitude (the owner, 2026-11-17).
      .filter((f) => !(flying || flown) || f.name !== "To"),
    ...(gps === null ? [] : [gps]),
  ];
  // The fuel required tapped, what it is made of (FuelBreakdown), at the
  // owner's ask ("fuel is the fuel required which gives a breakdown when
  // tapped"): once the nav log's figures are in.
  const next = nextLanding(totals, destination, flown?.hop);
  const breakdown = next.totals?.fuel_required_gal != null ? next : null;
  const tap = (f: StripFigure, face: ReactNode): ReactNode => {
    const said = f.said ?? f.name;
    if (!airplane && f.name !== "To" && f.name !== "Dist")
      return (
        <Button
          variant="link"
          size="inline"
          onClick={requestAirplanePick}
          data-testid="strip-pick-airplane"
          aria-label={said}
          className={AREA}
        >
          {face}
        </Button>
      );
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
    // The distance switches between nautical and statute miles, as Time
    // switches to the arrival (the owner, 2026-11-17: "Distance can switch
    // to sm"); the nav log is the floating bar's.
    if (f.name === "Dist" && !local && !flown)
      return (
        <Button
          variant="link"
          size="inline"
          onClick={() => setStatute(!statute)}
          data-testid="dist-unit"
          aria-label={`${seen(f)}, ${said}: show in ${statute ? "nautical" : "statute"} miles`}
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
  return <FigureStrip figures={ours} size={flying ? "flying" : grow ? "grow" : "fixed"} tap={tap} />;
}
