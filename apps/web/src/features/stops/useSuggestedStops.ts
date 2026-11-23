import { useCallback, useMemo, useState } from "react";
import type { FuelStopSuggestion, Totals } from "../../lib/api/types";
import { MAX_STOPS, pointName } from "../../lib/identSchema";
import { sameField } from "../../lib/procedures";

const NO_FUEL_STOPS: FuelStopSuggestion[] = [];
const NO_IDENTS: string[] = [];
const NO_SHORT: { name: string; onBoard: boolean }[] = [];

/** The route with `idents` put in after `after` (the departure, or one of
 *  its stops), as many as the planner takes (MAX_STOPS), and those that
 *  went in; null where none can. */
function withStopsAfter(dep: string, stops: string[], after: string, idents: string[]): { stops: string[]; added: string[] } | null {
  const room = MAX_STOPS - stops.length;
  if (room <= 0 || idents.length === 0) return null;
  const at = sameField(dep, after) ? 0 : stops.findIndex((stop) => sameField(stop, after)) + 1 || stops.length;
  const added = idents.slice(0, room);
  return { stops: [...stops.slice(0, at), ...added, ...stops.slice(at)], added };
}

/** The route with every flight's suggested fuel stops put in, each after
 *  its own flight's departure (withStopsAfter), and those that went in; a
 *  field already in the route is not put in twice. Every flight's, not the
 *  first's alone: the KLAS to KPWK flight of the owner's trip kept its
 *  tanks 21 gal short after "Add Fuel Stops" (2026-11-20). A break is the
 *  pilot's own pick (keepFuelStops), not one of these. Null where none
 *  goes in. */
export function withFuelStops(dep: string, stops: string[], suggested: FuelStopSuggestion[]): { stops: string[]; added: string[] } | null {
  let route = stops;
  const added: string[] = [];
  for (const flight of suggested) {
    if (flight.reason === "break") continue;
    const idents = flight.stops.map((s) => s.ident).filter((i) => !sameField(i, dep) && !route.some((s) => sameField(s, i)));
    const next = withStopsAfter(dep, route, flight.departure, idents);
    if (next) {
      route = next.stops;
      added.push(...next.added);
    }
  }
  return added.length ? { stops: route, added } : null;
}

/**
 * The stops the planner suggests -- fuel for a flight too long for its
 * tanks, a break on a long one -- the planner screen's view model for
 * them: those the pilot took out of the route box for this route, the
 * tanks FPL's fuel at each point is read against, their pins on the map,
 * and keeping one, or a field from the map's Stops, as the pilot's own.
 */
export function useSuggestedStops({
  totals,
  local,
  planned,
  setStops,
}: {
  totals: Totals | null | undefined;
  /** A local flight, one airport to itself: no stops to suggest. */
  local: boolean;
  planned: { dep: string; stops: string[]; dest: string };
  setStops: (stops: string[], fuelAdded?: string[]) => void;
}) {
  // The fuel stops the planner suggests for a flight too long for its
  // tanks (the totals' fuel_stops), kept: put in after the flight's
  // departure, in order, as many as the planner takes.
  const allFuelStops = local ? NO_FUEL_STOPS : (totals?.fuel_stops ?? NO_FUEL_STOPS);
  // Suggested fuel stops the pilot took out of the route box (its chip's
  // Remove), for this route: left out of the box, the list and the map
  // till the route changes, when they are suggested again (the More
  // menu's Show Fuel Stops went on 2026-11-21; the timeline's Add Fuel
  // Stops pill puts stops in), at the owner's ask ("Fuel stops should also
  // have a way to delete them and add them back as pleased", 2026-10-24).
  // FPL's Routes keep their own card for them.
  const fuelRoute = `${planned.dep}|${planned.stops.join(",")}|${planned.dest ?? ""}`;
  const [hiddenFuel, setHiddenFuel] = useState<{ route: string; idents: string[] }>({ route: "", idents: [] });
  const hiddenHere = hiddenFuel.route === fuelRoute ? hiddenFuel.idents : NO_IDENTS;
  const fuelStops = useMemo(
    () =>
      hiddenHere.length
        ? allFuelStops.map((f) => ({ ...f, stops: f.stops.filter((x) => !hiddenHere.includes(x.ident)) })).filter((f) => f.stops.length)
        : allFuelStops,
    [allFuelStops, hiddenHere],
  );
  const hideFuelStop = useCallback(
    (ident: string) => setHiddenFuel((was) => ({ route: fuelRoute, idents: [...(was.route === fuelRoute ? was.idents : []), ident] })),
    [fuelRoute],
  );
  // The tanks for FPL's fuel at each point: the fuel check's usable fuel
  // and allowance, the first flight's where the route has stops (each is
  // filled again), and each flight's own reserve as the planner gave it,
  // in order, which the engine holds each point to (fuel_in_tanks).
  const tankFigures = useMemo(() => {
    const t = local ? null : totals;
    const flights = t?.hops?.length ? t.hops.map((h) => h.totals) : t ? [t] : [];
    const usable = flights[0]?.usable_fuel_gal;
    if (!usable) return null;
    return {
      usableGal: usable,
      taxiGal: flights[0]?.taxi_gal ?? 0,
      reservesGal: flights.map((f) => f.reserve_gal ?? null),
      // Under IFR, the fuel on to the alternate the destination is held to
      // too (14 CFR 91.167(a)(2)): the last flight's, the route's own.
      alternateGal: t?.alternate?.fuel_gal ?? null,
    };
  }, [local, totals]);
  // The flights short of fuel the planner offers no stop on, and why
  // (the totals' no_fuel_stop), named by their ends.
  const noFuelStop = useMemo(
    () =>
      local || !totals?.no_fuel_stop?.length
        ? NO_SHORT
        : totals.no_fuel_stop.map((f) => ({ name: `${pointName(f.departure)} → ${pointName(f.destination)}`, onBoard: !!f.on_board })),
    [local, totals],
  );
  // Their pins on the map, every flight's.
  const fuelStopPins = useMemo(
    () => fuelStops.flatMap((f) => f.stops.map(({ ident, lat, lon }) => ({ ident, lat, lon, reason: f.reason }))),
    [fuelStops],
  );
  // A break the planner suggests on a long flight its tanks hold is the
  // pilot's own stop once kept, not a fuel stop (useFuelStops).
  const keepFuelStops = useCallback(
    (after: string, idents: string[]) => {
      const next = withStopsAfter(planned.dep, planned.stops, after, idents);
      const isBreak = fuelStops.some(
        (f) => f.reason === "break" && [...f.stops, ...(f.choices ?? [])].some((c) => idents.includes(c.ident)),
      );
      if (next) setStops(next.stops, isBreak ? [] : next.added);
    },
    [setStops, planned.dep, planned.stops, fuelStops],
  );
  // A field from the map's Stops put in the route after its flight's
  // departure, the pilot's own stop: by the route's own points, not its
  // course, which a tap before the course was in found missing.
  const addStopField = useCallback(
    (field: { ident: string; departure?: string | null }) => {
      const next = withStopsAfter(planned.dep, planned.stops, field.departure ?? planned.dep, [field.ident]);
      if (next) setStops(next.stops);
    },
    [setStops, planned.dep, planned.stops],
  );
  // Add Fuel Stops: every flight's suggested stops put in, in one step.
  // The planner has already planned the route with them in, each flight
  // between two of them on its own at its own altitude and winds, and put
  // in what those plans asked too, till none is short (wingtip.fuel_rounds):
  // the owner's KDSM to KCBK, flown on its own into the wind, had landed
  // 3 gal short of the stops chosen on the one flight's figures
  // (2026-11-20). One tap, as the owner asked ("After it added 3 stops, it
  // asked for another fuel stop").
  const toAdd = useMemo(() => withFuelStops(planned.dep, planned.stops, fuelStops), [planned.dep, planned.stops, fuelStops]);
  const addFuelStops = useCallback(() => {
    if (toAdd) setStops(toAdd.stops, toAdd.added);
  }, [toAdd, setStops]);
  return {
    fuelStops,
    hideFuelStop,
    tankFigures,
    noFuelStop,
    fuelStopPins,
    keepFuelStops,
    addStopField,
    // The stops Add Fuel Stops puts in, and putting them in; none where the
    // plan suggests none.
    fuelToAdd: toAdd ? { idents: toAdd.added, stops: toAdd.stops, add: addFuelStops } : null,
  };
}
