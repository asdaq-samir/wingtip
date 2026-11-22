import type { LngLatBoundsLike } from "maplibre-gl";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api/client";
import { chartPagePicture } from "../lib/diagram";

/**
 * The pages of one of the FAA's charts laid out for their map (ChartPages'
 * Pages): where each page is, in the degrees of a sliver of the equator,
 * and the chart's pages asked of the planner.
 */

/** Between one page and the next, in the pages' own pixels. */
const GAP = 60;
/** Degrees a page's pixel is laid on: the pages sit on a sliver of the
 *  equator, a few hundredths of a degree across, where the map's Mercator
 *  is flat to a part in a million: MapLibre has no plane of plain
 *  pixels. */
export const K = 1e-5;
/** No further in than two screen points a picture's pixel: past that the
 *  picture, drawn at 360 dots an inch (wingtip.publications), only grows
 *  coarser. MapLibre's world is 512 points across
 *  360 degrees at zoom 0. */
export const MAX_ZOOM = Math.log2((2 * 360) / (512 * K));

export interface Page {
  src: string;
  width: number;
  height: number;
}

export type Box = [west: number, south: number, east: number, north: number];

/** The pages one under another, each centred, in degrees (down the pages
 *  is south). */
export function laidOut(pages: Page[]) {
  const wide = Math.max(...pages.map((p) => p.width));
  let top = 0;
  const placed = pages.map((p) => {
    const left = (wide - p.width) / 2;
    const box: Box = [left * K, -(top + p.height) * K, (left + p.width) * K, -top * K];
    top += p.height + GAP;
    return { ...p, box };
  });
  const all: Box = [0, -(top - GAP) * K, wide * K, 0];
  return { placed, all };
}

export const corners = ([w, s, e, n]: Box): [[number, number], [number, number], [number, number], [number, number]] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];
export const bounds = ([w, s, e, n]: Box): LngLatBoundsLike => [
  [w, s],
  [e, n],
];

/** A ring drawn on the first page, at fractions of its width from its
 *  left and its height from its top: an airport diagram's hot spot. */
export interface PageRing {
  x: number;
  y: number;
}

/** The first page's fractions in the pages' degrees: across from its west
 *  edge, down from its north one. */
export const onPage = (page: { box: Box; width: number; height: number }, x: number, y: number): [number, number] => [
  page.box[0] + x * page.width * K,
  page.box[3] - y * page.height * K,
];

/** One of the FAA's charts' pages by its address (a card's approaches,
 *  the Chart Supplement), asked of the planner (/api/faa-chart), which
 *  draws them and, of a region's booklet, picks the field's. */
export function useFaaChartPages(url: string, airport: string) {
  const query = useQuery({
    queryKey: ["faaChart", url, airport],
    queryFn: () => api.faaChart(url, airport),
    staleTime: Infinity,
    meta: { silent: true },
  });
  const { data } = query;
  const pages = useMemo(() => (data?.pages ?? []).map((p) => ({ src: chartPagePicture(p), width: p.width, height: p.height })), [data]);
  return { ...query, pages };
}
