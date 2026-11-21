import { useQueries } from "@tanstack/react-query";
import { useIsMobile } from "../../../hooks/use-mobile";
import { unknownWhy } from "../../../lib/api/client";
import { leaveWhen } from "../../../lib/format/leaveWhen";
import { clockElsewhere, clockIn } from "../../../lib/format";
import { TEXT } from "../../../lib/text";
import { identOf, isPosition } from "../../../lib/identSchema";
import { NO_CONNECTION, noConnection } from "../../../lib/problems";
import { sameField } from "../../../lib/procedures";
import { airportQuery } from "../../../lib/queryClient";
import { DepartPicker } from "../../navlog/lazy";
import { FuelStopsChip, TimelineRoute, TypeRouteButton, visitAt, visitRow, type TimelinePoint } from "../../procedures/lazy";
import { etaAt } from "../../plan";
import type { PlanSlices } from "../vm/planSlices";
import type { ProceduresRouteProps } from "../../procedures/lazy";
import { MissingEnd, TypeRow } from "./RouteStart";

/**
 * FPL's route on the ground, the one layout (decision 0047) and where it
 * is edited (the owner's two-row timeline, 2026-11-17): the plan's points
 * in order for the procedures' timeline (TimelineRoute) -- the departure,
 * every stop (an airport, a waypoint or an airway typed), the destination
 * -- each with its time (the departure's leave time to pick, as its
 * picker says it; the others' arrival clock time from the nav log, a dash
 * with no airplane), its flight category from its latest METAR, whether
 * it is a fuel stop, and what keeps it from being flown to: a point the
 * planner does not know, or a field NASR lists as closed (its card's
 * label, the engine's field_status; decision 0043), with "Pick another
 * field." Until its card says whether it is open, a field is `checking`
 * and its line does not open to its runways and procedures; where the
 * card could not be had, its line says so. Each visit of a point the
 * route is at twice is its own (visitAt): its time is that visit's. No city on a line (the owner, 2026-11-17: "We don't need to say
 * the city name"); a Direct To's start is My Location. Half a route has
 * the end it lacks to pick in its place and the route to type last.
 * Below full, two stops or more are one row, a tap on it taking the sheet
 * all the way up where each is its own (the owner, 2026-11-18); read in
 * flight or a dry run, and in a desktop's full-height side panel, every
 * stop is listed.
 */
export default function RouteTimeline({
  vm,
  props,
}: {
  vm: PlanSlices<"brief" | "flight" | "leg" | "plan" | "route" | "routeList" | "stops" | "view">;
  /** The route's fields and points as the procedures draw them (useRouteListProps). */
  props: ProceduresRouteProps;
}) {
  const { depart, fuelParam, planned, routePoints, wholeRoute } = vm.route;
  const { aircraft, changeDepart, s } = vm.plan;
  const { routeRows } = vm.leg;
  const { metarCategory } = vm.brief;
  const { waypointStops } = vm.routeList;
  const { setStops } = vm.route;
  const { fuelToAdd } = vm.stops;
  const { panel, setPanel } = vm.view;
  const read = !!vm.flight.flying || !!vm.flight.dryRunning;
  // From md up the side panel is the window's height at half as at full
  // (sheet/grabberSizes), so its stops are always listed there.
  const tall = !useIsMobile();
  const fuel = (fuelParam ?? "").split(",").filter(Boolean);
  // Each field's card, asked once and shared with the route's colours
  // (useFieldColours) and its cards: whether NASR lists it closed.
  const fields = routePoints.filter((p) => !isPosition(p) && !!identOf(p) && !waypointStops.has(p));
  const cards = useQueries({ queries: fields.map((ident) => ({ ...airportQuery(ident), staleTime: 10 * 60_000 })) });
  const cardOf = (ident: string) => cards[fields.indexOf(ident)];
  // Whether NASR lists it closed, the engine's word on its card; until the
  // card is in, not known (`checking`), never taken as open (decision
  // 0043), and where it could not be had, said in its line.
  const statusOf = (ident: string) => {
    const card = cardOf(ident);
    if (card?.data) return { closed: card.data.closed ?? null, checking: false, failed: null };
    if (card?.isError || (card && noConnection(card)))
      return {
        closed: null,
        checking: true,
        failed: noConnection(card)
          ? `${NO_CONNECTION}. Whether ${ident} is open is not known.`
          : `Whether ${ident} is open could not be checked.`,
      };
    return { closed: null, checking: true, failed: null };
  };
  // The departure's own zone, from its card; none at My Location, where
  // this device's stands in for it.
  const departZone = planned.dep && fields.includes(planned.dep) ? cardOf(planned.dep)?.data?.time_zone : null;
  // When the airplane is at a point flown to: from the departure's time,
  // on this device's clock; none with no airplane or no nav log row yet.
  const from = depart || new Date().toISOString();
  const arrivalAt = (ident: string, role: TimelinePoint["role"], seen: number) => {
    if (role === "Departure" || aircraft.none) return null;
    const row = visitRow(routeRows, role, ident, seen);
    if (!row || row.minutesFlown === null) return null;
    return { at: new Date(new Date(from).getTime() + row.minutesFlown * 60_000), minutes: row.minutesFlown };
  };
  // Whether any point keeps another clock than the departure's: then every
  // point says its zone, the departure's too (the owner, 2026-11-20: "When
  // the time zone changes then show it on all the stops"); else none does.
  // And where this device keeps another clock than the departure's (a
  // pilot in Chicago planning Denver to Aspen): its unlabelled times read
  // as Denver's, an hour out, so every point says its zone then too.
  const deviceElsewhere = !!departZone && !!clockElsewhere(new Date(from), departZone, null);
  const zoned = deviceElsewhere || routePoints.some((ident, index) => {
    const role =
      index === 0 && ident === planned.dep
        ? "Departure"
        : index === routePoints.length - 1 && ident === planned.dest
          ? "Destination"
          : "Stop";
    const arrival = arrivalAt(ident, role, visitAt(routePoints, index).seen);
    return !!arrival && !!clockElsewhere(arrival.at, cardOf(ident)?.data?.time_zone, departZone);
  });
  const zoneOf = (at: Date, ident: string) => clockIn(at, fields.includes(ident) ? cardOf(ident)?.data?.time_zone : departZone);
  const timeOf = (ident: string, role: TimelinePoint["role"], seen: number) => {
    if (role === "Departure") {
      const leave = read ? (
        depart ? (
          leaveWhen(new Date(depart))
        ) : (
          "Now"
        )
      ) : (
        <DepartPicker value={depart} onChange={changeDepart} look="time" />
      );
      // Read, the departure's own clock and zone, as the stops'. Picked,
      // the picker keeps this device's clock, so it says this device's
      // zone: it said the departure's beside the device's time, two hours
      // out for a phone in New York leaving Denver.
      if (zoned && read && depart) {
        const there = zoneOf(new Date(depart), ident);
        if (there) return <ZonedTime {...there} />;
      }
      const here = zoned ? clockIn(new Date(from), null) : null;
      return here ? (
        <span className="inline-flex items-baseline">
          {leave}
          <span className={`ml-1 font-normal ${TEXT.caption}`}>{here.zone}</span>
        </span>
      ) : (
        leave
      );
    }
    const arrival = arrivalAt(ident, role, seen);
    if (!arrival) return "—";
    // On this device's clock, as the departure's; each in its own zone, its
    // zone said, once any point keeps another than the departure's.
    const there = zoned ? zoneOf(arrival.at, ident) : null;
    return there ? <ZonedTime {...there} /> : etaAt(from, arrival.minutes);
  };
  const points: TimelinePoint[] = routePoints.map((ident, index) => {
    const role =
      index === 0 && ident === planned.dep
        ? "Departure"
        : index === routePoints.length - 1 && ident === planned.dest
          ? "Destination"
          : "Stop";
    const field = fields.includes(ident);
    const unknown = s.unknownPlace?.ident && sameField(s.unknownPlace.ident, ident) ? unknownWhy(s.unknownPlace) : null;
    const status = field ? statusOf(ident) : { closed: null, checking: false, failed: null };
    const { seen, visit } = visitAt(routePoints, index);
    return {
      ident,
      role,
      index,
      seen,
      visit,
      time: timeOf(ident, role, seen),
      category: unknown || !field ? null : metarCategory(ident),
      problem: unknown ?? (status.closed ? `${status.closed}. Pick another field.` : status.failed),
      checking: status.checking,
      fuelStop: role === "Stop" && fuel.some((f) => sameField(f, ident)),
      field,
    };
  });
  // Half a route, open to edit: the end it lacks in its place, and the
  // route typed or pasted where Add a Stop is on a whole one (RouteStart).
  const half = !read && !wholeRoute;
  // The fuel stops' pill at Add a Stop's end: the planner's suggested ones
  // put in, every flight's, or, once the route has fuel stops and needs no
  // more, taken out again (the owner, 2026-11-20); none where there are
  // neither. Add while any flight still has stops suggested, though some are
  // in: the owner's trip read 21 gal short after the tap, its last flight's
  // stops never offered.
  const fuelIn = planned.stops.some((stop) => fuel.some((f) => sameField(f, stop)));
  const fuelPill = fuelToAdd ? (
    <FuelStopsChip added={false} onClick={fuelToAdd.add} />
  ) : fuelIn ? (
    <FuelStopsChip added onClick={() => setStops(planned.stops.filter((stop) => !fuel.some((f) => sameField(f, stop))))} />
  ) : null;
  // Type the Route, where More's item was (the owner, 2026-11-21: More keeps
  // three items): a keyboard glyph at Add a Stop's end on a whole route
  // whose field is folded, opening the route's field to type or paste it in
  // whole (RouteEditor), as Type or Paste a Route does before it is whole.
  const typeFuel =
    wholeRoute && vm.routeList.routeFolded ? (
      <>
        <TypeRouteButton onType={() => vm.routeList.setRouteOpen(true)} />
        {fuelPill}
      </>
    ) : (
      fuelPill
    );
  return (
    <TimelineRoute
      {...props}
      points={points}
      head={half && !planned.dep ? <MissingEnd vm={vm} end="Departure" /> : undefined}
      tail={half && !planned.dest ? <MissingEnd vm={vm} end="Destination" /> : undefined}
      foot={half ? <TypeRow vm={vm} /> : undefined}
      addTrailing={read ? undefined : typeFuel}
      allStops={read || tall || panel === "full"}
      onAllStops={() => setPanel("full")}
    />
  );
}

/** A time at a field in another zone, its zone smaller after it, "18:24 MST". */
function ZonedTime({ time, zone }: { time: string; zone: string }) {
  return (
    <span className="whitespace-nowrap">
      {time}
      <span className={`ml-1 font-normal ${TEXT.caption}`}>{zone}</span>
    </span>
  );
}
