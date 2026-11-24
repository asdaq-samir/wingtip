import { useQueries } from "@tanstack/react-query";
import { useIsMobile } from "../../../hooks/use-mobile";
import { plannerUnreachable, unknownWhy } from "../../../lib/api/client";
import { leaveWhen } from "../../../lib/format/leaveWhen";
import { arrivalDay, clockElsewhere, clockIn } from "../../../lib/format";
import { TEXT } from "../../../lib/text";
import { identOf, isPosition } from "../../../lib/identSchema";
import { NO_CONNECTION, noConnection } from "../../../lib/problems";
import { sameField } from "../../../lib/procedures";
import { airportQuery } from "../../../lib/queryClient";
import { DepartPicker } from "../../navlog/lazy";
import { TimelineRoute, visitAt, visitRow, type TimelinePoint } from "../../procedures/lazy";
import { etaAt, fixMinutes } from "../../plan";
import type { PlanSlices } from "../vm/planSlices";
import type { ProceduresRouteProps } from "../../procedures/lazy";
import { BoxToggle, MissingEnd } from "./RouteStart";
import { FuelPill } from "./FuelPill";

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
          : plannerUnreachable(card.error)
            ? // Asked again by itself (lib/queryRetry's refetchWhileUnreachable).
              `The planner could not be reached. Whether ${ident} is open will be checked again.`
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
  const zoned =
    deviceElsewhere ||
    routePoints.some((ident, index) => {
      const role =
        index === 0 && ident === planned.dep
          ? "Departure"
          : index === routePoints.length - 1 && ident === planned.dest
            ? "Destination"
            : "Stop";
      const arrival = arrivalAt(ident, role, visitAt(routePoints, index).seen);
      return !!arrival && !!clockElsewhere(arrival.at, cardOf(ident)?.data?.time_zone, departZone);
    });
  // Its day too where it is not the day the flight left (arrivalDay):
  // "Tue 15:54 CST" a day on, as etaAt writes the times with no zone.
  const zoneOf = (at: Date, ident: string) => {
    const zone = fields.includes(ident) ? cardOf(ident)?.data?.time_zone : departZone;
    const there = clockIn(at, zone);
    const day = arrivalDay(at, new Date(from), zone, departZone);
    return there && day ? { ...there, time: `${day} ${there.time}` } : there;
  };
  const timeOf = (ident: string, role: TimelinePoint["role"], seen: number) => {
    if (role === "Departure") {
      // Read, the departure's own clock and zone, as the stops'. Picked,
      // the picker keeps this device's clock, so it says this device's
      // zone: it said the departure's beside the device's time, two hours
      // out for a phone in New York leaving Denver. The zone always right
      // after the time, so "Now" over "14:05 CST", where it sat after the
      // two lines, "Now CST" over "14:05" (the owner's iPhone, 2026-11-23).
      if (zoned && read && depart) {
        const there = zoneOf(new Date(depart), ident);
        if (there) return <ZonedTime {...there} />;
      }
      const here = zoned ? clockIn(new Date(from), null) : null;
      // "Now" alone, its field's elevation under it as every line's
      // altitude is (the owner, 2026-11-24: "Under now just put altitude
      // instead of time to match others"), its zone after it.
      if (!read) return <DepartPicker value={depart} onChange={changeDepart} look="time" zone={here?.zone} clock={false} />;
      if (!depart) return here ? <ZonedTime time="Now" zone={here.zone} /> : "Now";
      const leave = leaveWhen(new Date(depart));
      return here ? <ZonedTime time={leave} zone={here.zone} /> : leave;
    }
    const arrival = arrivalAt(ident, role, seen);
    if (!arrival) return "—";
    // On this device's clock, as the departure's; each in its own zone, its
    // zone said, once any point keeps another than the departure's.
    const there = zoned ? zoneOf(arrival.at, ident) : null;
    return there ? <ZonedTime {...there} /> : etaAt(from, arrival.minutes);
  };
  // A procedure fix's time as a stop's is written, from the planner's
  // minutes to it (fixMinutes), in its field's zone where the stops say
  // theirs (the owner, 2026-11-24: "Each fix should show altitude and eta
  // on the right side to look similar to other stops").
  // On the field's own leg: a departure's fixes on the leg out of it, an
  // arrival's and an approach's on the leg into it.
  const fixAt = fixMinutes(routeRows);
  const fixTimeAt = (field: string) => (fix: string, leaving: boolean) => {
    const leg = fixAt.find((l) => sameField(leaving ? l.from : l.to, field));
    const minutes = aircraft.none ? undefined : leg?.minutes.get(fix);
    if (minutes === undefined) return null;
    const there = zoned ? zoneOf(new Date(new Date(from).getTime() + minutes * 60_000), field) : null;
    return there ? <ZonedTime {...there} /> : etaAt(from, minutes);
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
      fixTime: fixTimeAt(ident),
      category: unknown || !field ? null : metarCategory(ident),
      problem: unknown ?? (status.closed ? `${status.closed}. Pick another field.` : status.failed),
      checking: status.checking,
      fuelStop: role === "Stop" && fuel.some((f) => sameField(f, ident)),
      field,
    };
  });
  // Half a route, open to edit: the end it lacks in its place, and the
  // box's toggle in its last row where Add a Stop is on a whole one.
  const half = !read && !wholeRoute;
  // The fuel stops' pill at Add a Stop's end, as on the field's face (FuelPill).
  const fuelPill = <FuelPill vm={vm} />;
  // The box's toggle at Add a Stop's end on a whole route whose field is
  // folded, where More's item was (the owner, 2026-11-21: More keeps three
  // items), after the fuel stops' pill: the box's bottom right, as it is
  // on every face (BoxToggle).
  const typeFuel =
    wholeRoute && vm.routeList.routeFolded ? (
      <>
        {fuelPill}
        <BoxToggle vm={vm} focus={false} />
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
      // Half a route: no Add a Stop, the box's toggle in its last row --
      // the destination's to pick (MissingEnd), or the last point's.
      building={half}
      lastTrailing={half && planned.dest && !vm.routeList.boxOpen ? <BoxToggle vm={vm} /> : undefined}
      addTrailing={read ? undefined : typeFuel}
      allStops={read || tall || panel === "full"}
      half={!read && !tall && panel !== "full"}
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
