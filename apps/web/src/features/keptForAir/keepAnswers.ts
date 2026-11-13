import type { QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import type { AirportPlace, Briefing, Course } from "../../lib/api/types";
import { useBriefPlan } from "../../lib/briefPlan";
import { chartPagePicture } from "../../lib/diagram";
import { latestAnswer } from "../../lib/kept/latest";
import type { KeptKind } from "../../lib/kept/keptAge";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { airportQuery } from "../../lib/queryClient";
import { notamRankingQuery } from "../notamRanking";
import { keptRecordStore, keptRoute, type KeptRecord } from "./keptRecord";
import { keepProfile, keepRadar } from "./keepFlightPath";

/**
 * The route's answers kept for the air, in one go with its charts (Keep for
 * the Air, keepForAir): each asked again now, through the service worker,
 * which keeps the planner's answers as they pass (vite.config.ts:
 * planner-now for the briefing, planner-api for the nav log, the airport
 * cards and the weather loop, airport-diagrams for the plates' pages), and
 * the route's side view and the loop's newest radar over it
 * (keepFlightPath), the NOTAMs, a POST it cannot keep, in this browser's storage
 * (notamRanking). In the air each is shown from there with its age
 * (lib/kept). What fails is named missing, never in the way of the rest.
 */

/** The size of an answer as JSON, about what the worker holds of it. */
const bytesOf = (data: unknown) => {
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    return 0;
  }
};

/** A plate's or a page's picture fetched so the worker keeps it; its bytes. */
async function fetchBytes(url: string, signal?: AbortSignal): Promise<number> {
  const res = await fetch(url, { signal, priority: "low" });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.blob()).size;
}

/** The approach plates of a field, as its card's Charts tab shows them: each
 *  approach's pages from the planner and each page's picture. */
async function keepPlates(client: QueryClient, card: AirportPlace, signal?: AbortSignal): Promise<{ bytes: number; any: boolean }> {
  const approaches = (card.procedures ?? []).filter((c) => c.kind === "IAP");
  let bytes = 0;
  for (const chart of approaches) {
    const pages = await client.fetchQuery({
      queryKey: ["faaChart", chart.url, card.ident],
      queryFn: () => api.faaChart(chart.url, card.ident),
      staleTime: Infinity,
    });
    bytes += bytesOf(pages);
    for (const page of pages.pages) bytes += await fetchBytes(chartPagePicture(page), signal);
  }
  return { bytes, any: approaches.length > 0 };
}

/** Keeps the route's briefing, METARs and TAFs, NOTAMs, airport cards,
 *  plates (destination and alternate), plan, Go / No-Go and weather loop;
 *  the record of what is now on board. */
export async function keepRouteAnswers(
  client: QueryClient,
  course: Course,
  alternate: string | null,
  signal?: AbortSignal,
): Promise<KeptRecord> {
  const fields = [course.departure, ...(course.stops ?? []), course.destination].filter((a) => a.kind !== "fix").map((a) => a.ident);
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
  if (plan.routed) {
    try {
      bytes += bytesOf(await client.fetchQuery({ ...notamRankingQuery(plan), staleTime: 0 }));
      mark("notams", true);
    } catch {
      mark("notams", false);
    }
  }

  // Every field's card -- its frequencies, runways, weather and diagram's
  // cycle -- and the alternate's; the plates of the destination and the
  // alternate, where they publish approaches.
  const idents = [...new Set([...fields, ...(alternate ? [alternate] : [])])];
  const cards = await Promise.allSettled(idents.map((ident) => client.fetchQuery({ ...airportQuery(ident), staleTime: 0 })));
  cards.forEach((c) => (bytes += c.status === "fulfilled" ? bytesOf(c.value) : 0));
  mark(
    "airports",
    cards.every((c) => c.status === "fulfilled"),
  );
  const plateFields = [dest, ...(alternate ? [alternate] : [])];
  let plates = false;
  let platesFailed = false;
  for (const ident of plateFields) {
    const card = cards[idents.indexOf(ident)];
    if (card?.status !== "fulfilled") continue;
    try {
      const kept = await keepPlates(client, card.value, signal);
      bytes += kept.bytes;
      plates ||= kept.any;
    } catch {
      platesFailed = true;
    }
  }
  if (plates || platesFailed) mark("plates", !platesFailed);

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
