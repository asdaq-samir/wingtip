import { useAirplaneChosen } from "../../lib/preferences";
import { useState, type ReactNode } from "react";
import { zoneName } from "../../lib/format";
import { cn } from "cn";
import type { ExplainedTerm } from "../../lib/explain";
import { unknownWhy, type UnknownPlace } from "../../lib/api/client";
import type { Totals } from "../../lib/api/types";
import FigureStrip, { type StripFigure } from "../../components/FigureStrip";
import { Button } from "../../components/ui/button";
import { tripFigures, type Flown } from "../plan";
import { requestAirplanePick } from "../../lib/pickAirplane";
import { useFixFigures } from "./useFixFigures";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * The flight's figures, the last of the route's panel over the tabs, at
 * the pilot's ask: the quick figures read with the route -- the distance,
 * the time en route, the arrival and the track -- the detail under the
 * tabs. A strip of them as ForeFlight's is, each figure large under its
 * name in the nav log's shorthand ("DIST", "ETE"), at the pilot's ask,
 * where they were one grey line ("Dist 323.6 nm · ETA 17:07 (2h 45m) ·
 * Fuel 23.4 gal") read past at a glance. The arrival from the departure
 * time picked, or from now while it is "Now"; one airport to itself, the
 * time aloft and the time back. Where no legal altitude can be had, the
 * figures stay -- the book's, marked "≈" -- and why is the Brief's (its Go
 * / No-Go, red) and the altitude chip's, at the pilot's ask: in red in the
 * strip's place, it hid the distance and the time.
 *
 * Each figure exact and at its full size, a long trip's "13h 38m" as large
 * as a short one's: the columns take what their content needs, and only
 * where the strip is too narrow even so is a figure cut short (FigureStrip).
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
// The time en route and the arrival by the FAA's own shorthand (the owner,
// 2026-11-20: "Figures can say ETA or ETE"), where they were "Time" and
// "Arrival"; a tap on either still explains it (EXPLAIN).
const LABEL: Record<string, string> = { Dist: "Distance", ETE: "ETE" };

/** The names a tap explains (components/Explain; decision 0045): the time
 *  en route, the arrival, the fuel required. */
const EXPLAIN: Record<string, ExplainedTerm> = { ETE: "ETE", ETA: "ETA" };

const AREA = "relative max-w-full hit-x-2 hit-y-3";

/** A figure an airplane makes (the time, the fuel), with none picked: a
 *  dash, said as what it waits for. */
function wantsAirplane(f: StripFigure): StripFigure {
  const name = f.name === "ETA" ? "Arrival" : f.name === "Aloft" ? "Time Aloft" : WORDING.timeEnRoute;
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
  unknown = null,
}: {
  /** A point of the route the planner does not know, or a field abroad
   *  (usePlan's `unknownPlace`): where it is the To, said so on it. */
  unknown?: UnknownPlace | null;
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
  const stops = (totals?.hops.length ?? 0) > 0;
  const input = { totals, estimate, local, destination, depart, arrival, toDestination: stops && toDestination, flown, statute };
  const toLabel = stops && !local && !toDestination ? "Leg" : "Dest";
  // No airplane picked: the route's own figures alone, To and Dist --
  // the time is an airplane's, and none is assumed (the
  // owner, 2026-11-08: "only show the distance and the things you can
  // without airplane profile, don't assume").
  // The columns kept all the same, the time a dash in
  // the tint that asks for an airplane (lib/pickAirplane), where it
  // went and the strip said nothing of why (the UI audit's C2,
  // 2026-11-17): what the airplane would make of the route, none assumed.
  const airplane = useAirplaneChosen();
  // The airplane's GPS altitude at the strip's end whenever its position
  // is known (gpsFigure: what the figure is and where it comes from).
  // The track in the fuel's place (trackFigure): always a column, a dash
  // while there is no course to give. Both read from the fix as they are
  // written (useFixFigures), not at every fix.
  const { gps, track } = useFixFigures();
  const ours: StripFigure[] = [
    ...tripFigures(input)
      // The fuel is the timeline's tank gauges' and the nav log's, not the
      // strip's (the owner, 2026-11-21).
      .filter((f) => f.name !== "Fuel")
      .map((f) => (airplane || f.name === "To" || f.name === "Dist" ? f : wantsAirplane(f)))
      // The destination the planner does not know, said on the figure in
      // red with its mark, the pill too, where the pill read "ZZZZ" over
      // a dash as if nothing were wrong (the UI audit's B8).
      .map((f) =>
        f.name === "To" && unknown?.ident && f.value.toUpperCase() === unknown.ident.toUpperCase()
          ? { ...f, alert: true, said: `${f.said ?? f.value} ${unknownWhy(unknown)}` }
          : f,
      )
      // Each named in a short word in sentence case, "Leg" or "Dest", "Distance",
      // "ETE" (the owner's list, 2026-11-17; ETE since 2026-11-20), where "TO / DIST /
      // ETE / FUEL REQ" were capitals and shorthand.
      // The To named for what it reaches (the owner, 2026-11-18: "Replace
      // To with Leg or Dest when tapped"): "Leg" while it is the next stop,
      // "Dest" while it is the destination, which it always is with no stops
      // and on a flight to the field itself.
      .map((f) => ({
        ...f,
        label: f.name === "To" ? toLabel : (LABEL[f.name] ?? (f.name === "ETA" ? `ETA ${zoneName()}` : f.name)),
        explain: EXPLAIN[f.name],
      }))
      // An airplane's figure before the nav log's totals and with no
      // estimate is still coming: its shape, the dash kept for "needs an
      // airplane" (decision 0045).
      .map((f) => (airplane && !totals && f.value === "—" && f.name !== "To" ? { ...f, waiting: true } : f))
      // In flight (a dry run too) no To: the flying head over the map names
      // the next point, and the strip keeps four columns for the distance,
      // the time, the track and the GPS altitude (the owner, 2026-11-17, 2026-11-21).
      .filter((f) => !(flying || flown) || f.name !== "To"),
    track,
    ...(gps === null ? [] : [gps]),
  ];
  const tap = (f: StripFigure, face: ReactNode): ReactNode => {
    const said = f.said ?? f.name;
    if (!airplane && (f.name === "ETE" || f.name === "ETA" || f.name === "Aloft"))
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
    if (f.name === "To" && stops && !local)
      return (
        <Button
          variant="link"
          size="inline"
          onClick={() => setToDestination(!toDestination)}
          data-testid="to-toggle"
          aria-label={`${toLabel}, ${said}: show the ${toDestination ? "next stop" : "destination"}`}
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
