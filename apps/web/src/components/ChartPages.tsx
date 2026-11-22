import { Map as GlMap, type GeoJSONSource, type Marker, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker MapLibre parses its sources in (lib/map/gl/worker).
import "../lib/map/gl/worker";
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api/client";
import { chartPagePicture, type PageMark } from "../lib/diagram";
import { ownShipHtml } from "../lib/map/marks/icons";
import { usePreferences } from "../lib/preferences";
import { drawOwnShip, ownShipMarker, placeOwnShip } from "../lib/map/gl/layers/ownShipMarker";
import { CHART } from "../lib/tokens";

/**
 * The pages of one of the FAA's charts on a MapLibre map of their own,
 * own ship on the first: the full-screen viewer's (AirportDiagramViewer)
 * and the plate beside the map's (the plate's card at a tablet's width,
 * PlateCard), one copy.
 */

/** Between one page and the next, in the pages' own pixels. */
const GAP = 60;
/** Degrees a page's pixel is laid on: the pages sit on a sliver of the
 *  equator, a few hundredths of a degree across, where the map's Mercator
 *  is flat to a part in a million: MapLibre has no plane of plain
 *  pixels. */
const K = 1e-5;
/** No further in than two screen points a picture's pixel: past that the
 *  picture, drawn at 360 dots an inch (wingtip.publications), only grows
 *  coarser. MapLibre's world is 512 points across
 *  360 degrees at zoom 0. */
const MAX_ZOOM = Math.log2((2 * 360) / (512 * K));

export interface Page {
  src: string;
  width: number;
  height: number;
}

type Box = [west: number, south: number, east: number, north: number];

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

const corners = ([w, s, e, n]: Box): [[number, number], [number, number], [number, number], [number, number]] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];
const bounds = ([w, s, e, n]: Box): LngLatBoundsLike => [
  [w, s],
  [e, n],
];

/** A ring drawn on the first page, at fractions of its width from its
 *  left and its height from its top: an airport diagram's hot spot. */
export interface PageRing {
  x: number;
  y: number;
}

const NO_RINGS: PageRing[] = [];

/** The first page's fractions in the pages' degrees: across from its west
 *  edge, down from its north one. */
const onPage = (page: { box: Box; width: number; height: number }, x: number, y: number): [number, number] => [
  page.box[0] + x * page.width * K,
  page.box[3] - y * page.height * K,
];

/** The pages on a MapLibre map of their own: a pinch, a drag and a double
 *  tap do what they do on the chart; the first page whole as the furthest
 *  out, however the screen is turned, the rest a drag down. Own ship
 *  (`mark`) on the first page as a marker, the map's own airplane, which
 *  the map keeps on its point of the page through a pinch and a drag; the
 *  `rings` (an airport diagram's hot spots) a layer of the map's, in the
 *  chart's caution colour, so they keep their place as it does. */
export function Pages({ placed, all, mark, rings = NO_RINGS }: ReturnType<typeof laidOut> & { mark: PageMark | null; rings?: PageRing[] }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<GlMap | null>(null);
  const marker = useRef<Marker | null>(null);
  // The mark's markup as last written, so a fix a second moves the
  // element rather than building it again (OwnShipGl's way).
  const drawn = useRef("");
  // Drawn as on the chart, the Map card's Own Ship.
  const look = usePreferences((s) => s.ownShipLook);
  useEffect(() => {
    if (!box.current) return;
    const style: StyleSpecification = {
      version: 8,
      sources: Object.fromEntries(
        placed.map((p, i) => [
          `page-${i}`,
          { type: "image" as const, url: new URL(p.src, window.location.href).href, coordinates: corners(p.box) },
        ]),
      ),
      layers: [
        // The chart's paper round the pages.
        { id: "paper", type: "background", paint: { "background-color": CHART.casing } },
        ...placed.map((_, i) => ({ id: `page-${i}`, type: "raster" as const, source: `page-${i}`, paint: { "raster-fade-duration": 0 } })),
      ],
    };
    style.sources.rings = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    style.layers.push({
      id: "rings",
      type: "circle",
      source: "rings",
      paint: { "circle-radius": 18, "circle-color": CHART.caution, "circle-opacity": 0, "circle-stroke-width": 3, "circle-stroke-color": CHART.caution },
    });
    const map = new GlMap({
      container: box.current,
      style,
      bounds: bounds(placed[0]!.box),
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
    });
    map.touchZoomRotate.disableRotation();
    const fit = () => {
      const first = placed[0]!.box;
      const whole = map.cameraForBounds(bounds(first))?.zoom;
      if (whole === undefined) return;
      // The pages dragged no further than the first page whole leaves
      // round it: MapLibre zooms in until the view is inside its
      // maxBounds, and the pages' own box, its shape not a phone's tall
      // screen's, cut the page's sides at the furthest out (plates-map
      // spec). Half the screen across and down, in the pages' degrees at
      // that zoom (MapLibre's world 512 points round), a point to spare.
      const box = map.getContainer();
      const half = (points: number) => ((points + 2) * 360) / (512 * 2 ** whole) / 2;
      const [x, y] = [(first[0] + first[2]) / 2, (first[1] + first[3]) / 2];
      map.setMaxBounds(
        bounds([
          Math.min(all[0], x - half(box.clientWidth)),
          Math.min(all[1], y - half(box.clientHeight)),
          Math.max(all[2], x + half(box.clientWidth)),
          Math.max(all[3], y + half(box.clientHeight)),
        ]),
      );
      map.setMinZoom(Math.min(whole, MAX_ZOOM));
      if (map.getZoom() < whole) map.fitBounds(bounds(first), { duration: 0 });
    };
    map.on("load", fit);
    map.on("resize", fit);
    shown.current = map;
    return () => {
      marker.current?.remove();
      marker.current = null;
      drawn.current = "";
      shown.current = null;
      map.remove();
    };
  }, [placed, all]);
  // The rings as a source's features, set again as they change.
  useEffect(() => {
    const map = shown.current;
    const page = placed[0];
    if (!map || !page) return;
    const set = () =>
      (map.getSource("rings") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: rings.map((r) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: onPage(page, r.x, r.y) } })),
      });
    if (map.isStyleLoaded()) set();
    else map.once("load", set);
  }, [placed, rings]);
  useEffect(() => {
    const map = shown.current;
    const page = placed[0];
    if (!map || !page || !mark) {
      marker.current?.remove();
      return;
    }
    marker.current ??= ownShipMarker("chart-own-ship");
    // Nose up in its markup, turned by the marker to the track on the page.
    drawOwnShip(marker.current, drawn, ownShipHtml(mark.rotationDeg == null ? null : 0, false, look, mark.moving));
    placeOwnShip(marker.current, map, onPage(page, mark.x, mark.y), mark.rotationDeg ?? 0);
  }, [placed, mark, look]);
  // Black at night where it is drawn white on black: the canvas inverted.
  return <div ref={box} data-pages={placed.length} className="min-h-0 flex-1 bg-white dark:bg-black dark:[&_canvas]:invert" />;
}

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
