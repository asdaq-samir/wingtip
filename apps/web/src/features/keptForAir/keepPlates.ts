import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import type { AircraftProfile, Course, FlightPlates } from "../../lib/api/types";
import { useBriefPlan } from "../../lib/briefPlan";
import { courseFields } from "../../lib/course";
import { keepChart } from "../../lib/kept/keepChart";

/**
 * The plates Keep for the Air keeps for a flight (the market-gap audit's 3:
 * it kept the destination's approaches alone): the planner names them
 * (wingtip.plate_sets) -- the departure's, the destination's, each stop's,
 * the alternate's (the one filed, or the engine's pick, 14 CFR 91.169(c))
 * and those of the fields within the airplane's diversion range (the
 * engine's diversion_range_nm, from its own cruise and fuel; none with no
 * airplane picked) -- with their size before any is fetched, and each is
 * kept as the card's Charts tab shows it (lib/kept/keepChart).
 */

/** The route's points sent at most: a curving route's line thinned, the
 *  ends kept, so the address stays short. */
const MOST_FIXES = 60;

function fixesOf(line: [number, number][]): string {
  const step = Math.max(1, Math.ceil(line.length / MOST_FIXES));
  const kept = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  return kept.map(([lat, lon]) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join(";");
}

/** The flight's ask: its fields, line and alternate, its arrival from the
 *  nav log, and the picked airplane's own cruise and fuel. */
function flightPlatesAsk(
  course: Course,
  alternate: string | null,
  airplane: AircraftProfile | null | undefined,
  depart: string,
  eteMin: number | null,
) {
  const start = depart ? new Date(depart).getTime() : Date.now();
  return {
    route: courseFields(course)
      .map((a) => a.ident)
      .join(","),
    fixes: fixesOf(course.course_line as [number, number][]),
    alternate: alternate ?? undefined,
    eta: eteMin != null ? new Date(start + eteMin * 60_000).toISOString() : undefined,
    tas_kt: airplane?.cruise_tas_kt ?? undefined,
    usable_gal: airplane?.usable_fuel_gal ?? undefined,
    burn_gph: airplane?.fuel_burn_gph ?? undefined,
  };
}

/** The query of a flight's plates, as the plan on screen asks it. */
export function flightPlatesQuery(course: Course, alternate: string | null) {
  const plan = useBriefPlan.getState();
  const ask = flightPlatesAsk(course, alternate, plan.flight?.nav?.aircraft, plan.depart, plan.eteMin);
  return { queryKey: ["flightPlates", ask], queryFn: () => api.flightPlates(ask) };
}

/** The flight's plates and their size, for the size said before the keep
 *  (Settings' Keep for the Air); null with no route. */
export function useFlightPlates(course: Course | null, alternate: string | null) {
  const airplane = useBriefPlan((s) => s.flight?.nav?.aircraft);
  const depart = useBriefPlan((s) => s.depart);
  const eteMin = useBriefPlan((s) => s.eteMin);
  const ask = course ? flightPlatesAsk(course, alternate, airplane, depart, eteMin) : null;
  const query = useQuery({
    queryKey: ["flightPlates", ask],
    queryFn: () => api.flightPlates(ask!),
    enabled: !!ask,
    staleTime: 10 * 60_000,
    meta: { silent: true },
  });
  return course ? (query.data ?? null) : null;
}

const CONCURRENCY = 4;

/** Every chart the planner named fetched so the worker keeps it: their
 *  bytes, how many, and whether any could not be had. */
export async function keepFlightPlates(client: QueryClient, wanted: FlightPlates, signal?: AbortSignal) {
  const jobs = wanted.fields.flatMap((f) => f.charts.map((chart) => ({ chart, ident: f.ident })));
  let bytes = 0,
    failed = false,
    next = 0;
  const worker = async () => {
    while (next < jobs.length && !signal?.aborted) {
      const job = jobs[next++]!;
      try {
        bytes += await keepChart(client, job.chart, job.ident, signal);
      } catch {
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { bytes, charts: jobs.length, failed };
}

/** A size as the app says one kept: "about 52 MB", "about 0.4 MB". */
export function aboutMb(bytes: number): string {
  const mb = bytes / 1e6;
  return `about ${mb >= 1 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
}

/** The line said before a keep: how much the flight's plates come to, and
 *  where no airplane is picked, that the diversions' need one. */
export function flightPlatesLine(plates: FlightPlates | null): string | null {
  if (!plates) return null;
  const fields = plates.fields.length;
  const size = `This flight's plates: ${aboutMb(plates.bytes)}, ${fields} ${fields === 1 ? "field" : "fields"}`;
  if (plates.basis === "no_airplane") return `${size}. Pick an airplane to keep the fields within diversion range too.`;
  return `${size}, within ${Math.round(plates.range_nm ?? 0)} nm of the route.`;
}
