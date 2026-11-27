import { useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWindPicks, landingRunway, type Landing, type ProcedureAirport } from "../plan";
import { plateQuery } from "../../lib/queryClient";
import { sameField } from "../../lib/procedures";
import { useFieldWinds } from "./useFieldWinds";
import type { RouteListFlat } from "./routeProps";

/**
 * The route list's winds and runways (useProceduresRoute's part): each
 * field's wind, reported or forecast for when the airplane is there
 * (useFieldWinds), the runway landed on and left from at each, and the
 * runways picked into the wind for the pilot until the pilot picks one.
 */
export function useRunwayWinds({
  airports,
  rows,
  depart,
  inRoute,
  picked,
  takeoffs,
  autoPicked,
  onPreselect,
  onPreselectTakeoff,
}: Pick<
  RouteListFlat,
  "airports" | "rows" | "depart" | "inRoute" | "picked" | "takeoffs" | "autoPicked" | "onPreselect" | "onPreselectTakeoff"
>) {
  // Each field's wind, reported or forecast for when the airplane is there
  // (useFieldWinds).
  const winds = useFieldWinds({ airports, rows, depart });
  const { cards, forecastFor, forecasts, windOf } = winds;
  // Each field's approach in the route, and whether its plate publishes
  // circling minimums -- the one plate the map draws (PlatesGl).
  const approachesIn = inRoute.filter((p) => p.kind === "approach");
  const plates = useQueries({ queries: approachesIn.map((p) => plateQuery(p.ident, p.id)) });
  // Landed by an approach once it is activated: one only loaded is not
  // flown, the field's runway landed on as with none.
  const landingOf = (ident: string): Landing | null => {
    const i = approachesIn.findIndex((p) => sameField(p.ident, ident) && !p.loaded);
    return i < 0 ? null : { runway: approachesIn[i]!.runway, circling: plates[i]?.data?.circling, name: approachesIn[i]!.label };
  };
  // The runway landed on at a field, and a stop's to leave from. With an
  // approach, the approach's own straight in, another only where the pilot
  // picked it and the plate publishes circling minimums (the engine's
  // landing_runway, AIM 5-4-20): "Land RWY 9" with KDLH's ILS 09, where
  // the tray stood open with nothing picked (the HIG review's Q3).
  const landedOn = (ident: string) => {
    const now = picked.get(ident) ?? null;
    const landing = landingOf(ident);
    return landing ? landingRunway(landing, now, now !== null && !autoPicked.has(`land:${ident}`)).runway : now;
  };
  const chosenAt = (ident: string) => landedOn(ident);
  const takeoffAt = (ident: string) => takeoffs.get(ident) ?? null;
  // Each field of the route, its runway picked into the wind until the
  // pilot picks one or none, at the owner's ask ("a preselected runway into
  // the wind", "Departing runway should also be pre selected"): most fly
  // the runway ATC gives them with no approach, so no approach is picked.
  // Once a field, so a runway picked and taken back is not picked again
  // under the pilot's finger.
  const preselected = useRef(new Set<string>());
  // A field listed twice (a round trip) picks its landing's runway once.
  const preselectedLand = (a: ProcedureAirport) => airports.findIndex((b) => sameField(b.ident, a.ident)) !== airports.indexOf(a);
  const intoWind = airports
    .flatMap((a, i) => {
      // A forecast still coming is waited for, not picked past on the wind now.
      if (forecastFor[i] != null && forecasts[i]?.isPending) return [];
      const wind = windOf(a.ident);
      // Calm, the runway in use or the longest (windPick), as the owner asked.
      if (!wind || !wind.ident) return [];
      // One picked into the wind before, and not by the pilot since, goes to
      // the runway the wind now favours (`autoPicked`).
      const free = (which: string, now: string | undefined) =>
        now === undefined || (autoPicked.has(`${which}:${a.ident}`) && now !== wind.ident);
      return [
        ...(!free("land", picked.get(a.ident)) || landingOf(a.ident) || preselectedLand(a) ? [] : [`land:${a.ident}:${wind.ident}`]),
        // A stop's runway to leave from, into the wind as its landing's.
        ...((a.role !== "Stop" &&
          !(a.role === "Departure" && airports.some((b) => b !== a && b.role === "Destination" && sameField(b.ident, a.ident)))) ||
        !free("takeoff", takeoffs.get(a.ident))
          ? []
          : [`takeoff:${a.ident}:${wind.ident}`]),
      ];
    })
    // With an approach, its own runway written to the address where none
    // was picked or the wind's was (landedOn), so the plan flies it; no
    // wind is waited for.
    .concat(
      airports.flatMap((a) => {
        const land = landingOf(a.ident) && !preselectedLand(a) ? landedOn(a.ident) : null;
        return land && land !== picked.get(a.ident) ? [`land:${a.ident}:${land}`] : [];
      }),
    )
    .join(",");
  // Save waits while a field's wind is still coming (features/plan/windPicks): its
  // runway is picked into it as it comes, and the route planned again.
  const windComing = airports.some((_, i) => (forecastFor[i] != null ? forecasts[i]?.isPending : cards[i]?.isPending) ?? false);
  useEffect(() => () => useWindPicks.setState({ pending: false }), []);
  useEffect(() => {
    let picking = false;
    for (const pick of intoWind ? intoWind.split(",") : []) {
      const [which, ident, end] = pick.split(":") as [string, string, string];
      // Once a field, and once more each time the wind turns a runway
      // picked into it: never again where the pilot took one back.
      const once = autoPicked.has(`${which}:${ident}`) ? `${which}:${ident}:${end}` : `${which}:${ident}`;
      if (preselected.current.has(once)) continue;
      preselected.current.add(once);
      picking = true;
      if (which === "land") onPreselect(ident, end);
      else onPreselectTakeoff(ident, end);
    }
    // Still pending while a pick just made is on its way into the address,
    // so Save does not keep the plan from before it (features/plan/windPicks);
    // the render that brings it runs this again. Never held for good: a
    // pick that does not land lets go after a second.
    useWindPicks.setState({ pending: windComing || picking });
    if (!picking) return;
    const letGo = window.setTimeout(() => useWindPicks.setState({ pending: false }), 1000);
    return () => window.clearTimeout(letGo);
  }, [intoWind, autoPicked, onPreselect, onPreselectTakeoff, windComing, picked, takeoffs]);
  return { ...winds, landingOf, chosenAt, takeoffAt };
}
