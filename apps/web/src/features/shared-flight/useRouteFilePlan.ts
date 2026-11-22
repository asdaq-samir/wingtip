import { useQueries } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { closedOf, useAirportIndex } from "../../lib/airportIndex";
import type { EngineAnswer } from "../../lib/engine/engine";
import { MAX_STOPS } from "../../lib/identSchema";
import type { SharedLink, SharedPlan } from "../../lib/sharedFlight";

type Read = EngineAnswer<"route_file_read">;
type Route = Extract<Read, { departure: unknown }>;
type FilePoint = Route["departure"];

/** One of the file's points as the preview lists it: the ident it goes
 *  into the plan as, or null where it is left out, and why. */
interface FileRow {
  /** How the row names it: its ident, or the file's own name. */
  title: string;
  /** Its ident in the plan; null where it is left out. */
  ident: string | null;
  /** What happened to it, where it is not the file's ident as it came:
   *  named off a fix, closed, no fix near. */
  note: string | null;
}

/** The parts of a route file's preview (SharedFlightSheet). */
export interface RouteFilePlan {
  /** The route's name in the file, else the file's own. */
  title: string;
  rows: FileRow[];
  /** The plan to use, null until its points are named, and where it
   *  cannot be used ({@link problem}). */
  plan: SharedPlan | null;
  /** Why it cannot be used: the engine's words for a file that is not a
   *  route, a closed end, more stops than a plan makes. */
  problem: string | null;
  /** Its own points still being named off the nearest fix. */
  naming: boolean;
}

const planOf = (dep: string, dest: string, stops: string[]): SharedPlan => ({
  dep,
  dest,
  stops,
  altitudeFt: null,
  depart: null,
  type: null,
  rules: null,
  tail: null,
  tanks: {},
});

/**
 * A route file's preview, the file read by the engine (route_file_read):
 * each point between the ends with no ident of its own -- a user
 * waypoint, a GPX point named in words -- named as the pilot's own point
 * off the nearest fix, as a point dropped on the map is (the planner's
 * frd_near, GET /api/airspace/at, its cache shared with the point's card);
 * a closed field never offered (decision 0043, the engine's field_status
 * through the airport index): one between the ends left out and said so,
 * a closed end the plan not offered at all. Null for any other link.
 */
export function useRouteFilePlan(link: SharedLink): RouteFilePlan | null {
  const route = link.kind === "file" && "departure" in link.read ? link.read : null;
  const between: FilePoint[] = route?.between ?? [];
  const index = useAirportIndex(route !== null, true);
  const named = useQueries({
    queries: between.map((p) => ({
      queryKey: ["airspaceAt", p.lat, p.lon],
      queryFn: () => api.airspaceAt(p.lat, p.lon),
      enabled: p.ident === null,
      staleTime: 10 * 60_000,
    })),
  });
  if (link.kind !== "file") return null;
  const title = route?.name ?? link.fileName;
  if (!route) return { title, rows: [], plan: null, problem: "error" in link.read ? link.read.error : null, naming: false };

  const closedEnd = [route.departure, route.destination].find((p) => p.ident && closedOf(index, p.ident));
  const rows: FileRow[] = [];
  const stops: string[] = [];
  between.forEach((p, i) => {
    const title = p.ident ?? p.name ?? "User Waypoint";
    if (p.ident) {
      const closed = closedOf(index, p.ident);
      if (closed) rows.push({ title, ident: null, note: `${closed}: left out` });
      else {
        rows.push({ title, ident: p.ident, note: null });
        stops.push(p.ident);
      }
      return;
    }
    const asked = named[i]!;
    const off = asked.data?.point ?? null;
    if (off) {
      rows.push({ title, ident: off.ident, note: off.name });
      stops.push(off.ident);
    } else rows.push({ title, ident: null, note: asked.isPending ? null : "No fix near it: left out" });
  });
  const ends = (p: FilePoint): FileRow => {
    const closed = closedOf(index, p.ident!);
    return { title: p.ident!, ident: p.ident, note: closed ?? (p.name && p.name !== p.ident ? p.name : null) };
  };
  const naming = between.some((p, i) => p.ident === null && named[i]!.isPending);
  const problem = closedEnd
    ? `${closedEnd.ident} is ${closedOf(index, closedEnd.ident!)!.toLowerCase()}, and a closed field is never a route's end.`
    : stops.length > MAX_STOPS
      ? `This route has ${stops.length} stops; a plan makes ${MAX_STOPS} at the most.`
      : null;
  return {
    title,
    rows: [ends(route.departure), ...rows, ends(route.destination)],
    plan: problem || naming ? null : planOf(route.departure.ident!, route.destination.ident!, stops),
    problem,
    naming,
  };
}
