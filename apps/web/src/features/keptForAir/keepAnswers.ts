import type { QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import type { Briefing, Course } from "../../lib/api/types";
import { useBriefPlan } from "../../lib/briefPlan";
import { bytesOf, chartKey } from "../../lib/kept/keepChart";
import { latestAnswer } from "../../lib/kept/latest";
import type { KeptKind } from "../../lib/kept/keptAge";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { airportQuery, fieldNotamsQuery } from "../../lib/queryClient";
import { notamRankingQuery } from "../notamRanking";
import { keptRecordStore, keptRoute, type KeptRecord } from "./keptRecord";
import { keepProfile, keepRadar } from "./keepFlightPath";
import { flightPlatesQuery, keepFlightPlates } from "./keepPlates";
import { courseFields } from "../../lib/course";

/**
 * The route's answers kept for the air, in one go with its charts (Keep for
 * the Air, keepForAir): each asked again now, through the service worker,
 * which keeps the planner's answers as they pass (vite.config.ts:
 * planner-now for the briefing, planner-api for the nav log, the airport
 * cards and the weather loop, faa-plates for the plates' pages), and
 * the route's side view and the loop's newest radar over it
 * (keepFlightPath), the NOTAMs, a POST it cannot keep, in this browser's storage
 * (notamRanking), and each field's own NOTAMs, its card's list, through the
 * worker as planner-api keeps them. In the air each is shown from there with its age
 * (lib/kept). What fails is named missing, never in the way of the rest.
 */

/** Keeps the route's briefing, METARs and TAFs, NOTAMs, airport cards,
 *  plan, Go / No-Go and weather loop; the record of what is now on board.
 *  The plates come after the chart tiles (keepRoutePlates). */
export async function keepRouteAnswers(
  client: QueryClient,
  course: Course,
  alternate: string | null,
  signal?: AbortSignal,
): Promise<KeptRecord> {
  const fields = courseFields(course).map((a) => a.ident);
  const dep = course.departure.ident;
  const dest = course.destination.ident;
  const onBoard = new Set<KeptKind>();
  const missing = new Set<KeptKind>();
  let bytes = 0;
  const mark = (kind: KeptKind, ok: boolean) => (ok ? onBoard : missing).add(kind);

  // The briefing the page asks for this route, asked again so the worker
  // holds a fresh one: its METARs and TAFs, and the Go / No-Go worked from it.
  await client.refetchQueries({ queryKey: ["briefing", dep, dest], type: "active" }).catch(() => undefined);
  const briefed = latestAnswer<Briefing>(client, ["briefing", dep, dest]);
  const briefing = briefed?.data ?? null;
  mark("briefing", !!briefing && !briefed?.failed);
  mark("weather", !!briefing && Object.keys(briefing.metars ?? {}).length > 0);
  mark("go_no_go", !!briefing);
  bytes += bytesOf(briefing);

  // The nav log the page planned: the worker kept its answer as it came.
  const planned = latestAnswer(client, ["navlog", dep, dest]);
  mark("plan", !!planned);
  // And the route from the side, which the side view and the printed log
  // draw (keepFlightPath); each draws the route without it where it fails.
  await keepProfile(client, course);

  const plan = useBriefPlan.getState();
  let ranked: boolean | null = null;
  if (plan.routed) {
    try {
      bytes += bytesOf(await client.fetchQuery({ ...notamRankingQuery(plan), staleTime: 0 }));
      ranked = true;
    } catch {
      ranked = false;
    }
  }
  // And the departure's, the destination's and each stop's own NOTAMs, the
  // airport card's list (GET /api/airport/{ident}/notams), which the worker
  // keeps as it passes (planner-api): before, a card opened in the air
  // showed them only where it had been opened online (14 CFR 91.103 asks for the NOTAMs of every
  // field a flight uses).
  const notams = await Promise.allSettled(fields.map((ident) => client.fetchQuery({ ...fieldNotamsQuery(ident), staleTime: 0 })));
  notams.forEach((n) => (bytes += n.status === "fulfilled" ? bytesOf(n.value) : 0));
  // On board only where the route's list and every field's came: a field
  // whose NOTAMs could not be had is said missing, never kept quiet.
  if (ranked !== null || notams.length) mark("notams", ranked !== false && notams.every((n) => n.status === "fulfilled"));

  // Every field's card -- its frequencies, runways, weather and diagram's
  // cycle -- and the alternate's.
  const idents = [...new Set([...fields, ...(alternate ? [alternate] : [])])];
  const cards = await Promise.allSettled(idents.map((ident) => client.fetchQuery({ ...airportQuery(ident), staleTime: 0 })));
  cards.forEach((c) => (bytes += c.status === "fulfilled" ? bytesOf(c.value) : 0));
  mark(
    "airports",
    cards.every((c) => c.status === "fulfilled"),
  );
  // The weather loop's newest frame list, of the pick in the Map menu.
  const loop = useWeatherLayers.getState().loop;
  // With its newest radar picture over the route (keepFlightPath), so the
  // loop kept is not a list of frames over a blank map.
  try {
    const frames = await api.weatherLoop(loop === "off" ? "radar" : loop);
    bytes += bytesOf(frames);
    const radar = await keepRadar(frames, course, signal);
    bytes += radar.bytes;
    mark("weather_loop", radar.kept || !frames.frames.some((f) => f.radar_tiles));
  } catch {
    mark("weather_loop", false);
  }

  const record: KeptRecord = {
    route: keptRoute(fields, alternate),
    at: Date.now(),
    onBoard: [...onBoard],
    missing: [...missing].filter((k) => !onBoard.has(k)),
    bytes,
  };
  keptRecordStore().setState({ value: record });
  return record;
}

/**
 * The plates a flight may need (keepPlates): the departure's, the
 * destination's, each stop's, the alternate's and those of the fields
 * within the airplane's diversion range, added to the record the answers
 * wrote (keepRouteAnswers). Kept after the chart tiles (keepForAir): tens
 * of megabytes of pages, a few minutes on a slow line, which held the
 * tiles and their "Saving Charts Offline" back until they were all in
 * (flight-critical.spec, 2026-11-22).
 */
export async function keepRoutePlates(client: QueryClient, course: Course, alternate: string | null, signal?: AbortSignal): Promise<void> {
  let kept: { bytes: number; charts: number; failed: boolean } | null = null;
  let plates: string[] = [];
  try {
    const wanted = await client.fetchQuery({ ...flightPlatesQuery(course, alternate), staleTime: 0 });
    kept = await keepFlightPlates(client, wanted, signal);
    plates = wanted.fields.flatMap((f) => f.charts.map((c) => chartKey(c.url)));
  } catch {
    // Not had: said missing below (kept stays null).
  }
  const route = keptRoute(
    courseFields(course).map((a) => a.ident),
    alternate,
  );
  const record = keptRecordStore().getState().value;
  // Only onto this route's record: another keep since has its own.
  if (!record || record.route !== route) return;
  const ok = kept !== null && !kept.failed;
  const said = kept === null || kept.charts > 0 || kept.failed;
  keptRecordStore().setState({
    value: {
      ...record,
      bytes: record.bytes + (kept?.bytes ?? 0),
      plates,
      onBoard: said && ok ? [...new Set([...record.onBoard, "plates" as const])] : record.onBoard,
      missing: said && !ok ? [...new Set([...record.missing, "plates" as const])] : record.missing,
    },
  });
}
