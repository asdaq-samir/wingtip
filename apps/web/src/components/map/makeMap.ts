import * as maplibregl from "maplibre-gl";
import type { LayerSpecification, PaddingOptions, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker MapLibre parses its sources in (worker.ts).
import "../../lib/map/gl/worker";
// The app's own typeface for the map's words (MapLibre draws them from
// the font file, no glyph server): the Latin subset the page loads.
import interUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

/** The characters the Latin file of Inter holds, as fontsource's own CSS
 *  declares them (@fontsource-variable/inter, wght.css's latin face): the
 *  traffic's climb and descent arrows (U+2191, U+2193) and the minus among
 *  them, which a range of Latin-1 and punctuation alone left to MapLibre's
 *  fallback drawing. */
const INTER_LATIN = [
  "U+0000-00FF",
  "U+0131",
  "U+0152-0153",
  "U+02BB-02BC",
  "U+02C6",
  "U+02DA",
  "U+02DC",
  "U+0304",
  "U+0308",
  "U+0329",
  "U+2000-206F",
  "U+20AC",
  "U+2122",
  "U+2191",
  "U+2193",
  "U+2212",
  "U+2215",
  "U+FEFF",
  "U+FFFD",
];
import type { MapInsets } from "../../lib/mapChrome";
import { watchMapErrors } from "./mapErrors";
import type { OverlayTiles } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { overlayTilesQuery, queryClient } from "../../lib/queryClient";
import { prefetchRing, registerOverlayProtocol } from "../../lib/map/sources/overlayTiles";
import { COUNTRY_ZOOM, OPEN_ZOOM, useOwnShip } from "../../lib/map/position/ownShip";
import { SLOTS, slotId, type Slot } from "../../lib/map/gl/glLayer";
import type { DrawnImage } from "../../lib/map/gl/drawSvg";
import { OVERLAY_SOURCE, overlayPictures, overlayStyle } from "../../lib/map/gl/glOverlays";
import { glZoom } from "../../lib/map/gl/glStyle";
import { probeLayers } from "../../lib/map/gl/useGlProbe";
import { fewerPixelsOnSoftware } from "../../lib/map/gl/softwareGl";

/** The map GlMapShell makes (makeMap) and what every map of the page
 *  shares: the overlays' pictures, drawn once, the overlay tiles each map
 *  draws, and which maps have loaded their style. */

const COUNTRY: [number, number] = [39.5, -98.35];
/** The map's first showing (GlMap's reveal): at the latest this long after
 *  it is made, faded in over this long. */
const REVEAL_LATEST_MS = 2500;
const REVEAL_FADE_MS = 150;
/** Sent on the map's element as it is first shown (makeMap's reveal). */
export const REVEAL_EVENT = "mapreveal";

// The overlay tiles' protocol, once for the page (lib/map/sources/overlayTiles).
registerOverlayProtocol(maplibregl);

/** The overlays' pictures, once drawn (glOverlays' overlayPictures), for
 *  every map to take as a tile asks for one. */
let pictures: Map<string, DrawnImage> | null = null;
export const picturesDrawn = overlayPictures().then(
  (p) => {
    pictures = p;
  },
  () => {
    pictures = new Map();
  },
);
/** Whether the overlays' pictures are drawn yet. */
export const picturesReady = () => pictures !== null;

/** The overlay tiles each map draws, for its prefetch round the view. */
export const overlaysOf = new WeakMap<maplibregl.Map, OverlayTiles>();

/** The maps whose style has loaded. */
export const loaded = new WeakSet<maplibregl.Map>();

/** What the panel covers, as MapLibre's padding: its middle is the map's. */
export function padOf({ top, bottom, left, right = 0 }: MapInsets): Required<PaddingOptions> {
  return { top, bottom, left, right };
}

/**
 * A map made in `holder`, at the pilot's last position or the country, in
 * the middle of what the panel leaves (padding), its first style the
 * slots' empty layers with the cycle's FAA overlays (glOverlays) among
 * them, so the airspace, the airports and the navaids load per tile with
 * the chart rather than each asking the planner for the view.
 */
export function makeMap(holder: HTMLDivElement, insets: MapInsets): maplibregl.Map {
  const last = useOwnShip.getState().lastFix;
  const [lat, lon] = last ? [last.lat, last.lon] : COUNTRY;
  const tiles = queryClient.getQueryData(overlayTilesQuery.queryKey) ?? null;
  const overlays = tiles ? overlayStyle(tiles) : null;
  const layers: LayerSpecification[] = SLOTS.flatMap((s: Slot) => [
    ...(overlays?.layers[s] ?? []),
    { id: slotId(s), type: "background" as const, layout: { visibility: "none" as const } },
  ]);
  const style: StyleSpecification = {
    version: 8,
    sources: overlays?.sources ?? {},
    layers,
    // The same variable font under a second name: MapLibre draws a name
    // with "Bold" in it at weight 700 (GL_FONT_BOLD, the chart's labels).
    "font-faces": {
      Inter: [{ url: interUrl, "unicode-range": INTER_LATIN }],
      "Inter Bold": [{ url: interUrl, "unicode-range": INTER_LATIN }],
    },
  };
  const m = new maplibregl.Map({
    container: holder,
    style,
    center: [lon, lat],
    zoom: glZoom(last ? OPEN_ZOOM : COUNTRY_ZOOM),
    minZoom: glZoom(3),
    attributionControl: false,
    // Turned as Apple Maps' map turns (the owner's "Yes to all recs",
    // 2026-11-17): two fingers twisted, a right drag or Ctrl and a drag
    // with a mouse, Shift and the arrows from the keyboard (MapLibre's own
    // keys: arrows pan, + and - zoom, Shift and left or right turn, Shift
    // and up or down tilt, its keyboard tying the two), the compass among
    // the map's buttons turning it north up again (CompassButton). A chart
    // was read north up before. No tilt by hand on the flat chart: the 3D
    // button stands the map up (TerrainGl), and a two-finger drag up or
    // down tilting a flat chart with no ground under it would be in the
    // way of the pinch and the twist; a right drag turns and does not tilt.
    pitchWithRotate: false,
    touchPitch: false,
    // Symbols placed at once, not faded in over 0.3 s.
    fadeDuration: 0,
    // Two levels of tiles kept in memory a source, not MapLibre's five: the service worker and the overlay tiles'
    // store keep the bytes, and five levels of decoded chart and overlay tiles held an iPad's memory for views
    // the pilot has left (the map speed audit, 2026-11-27).
    maxTileCacheZoomLevels: 2,
    // And its world copies (its default): the Western Aleutian sectional runs across 180°.
  });
  if (tiles) overlaysOf.set(m, tiles);
  // A tile's picture from those drawn ahead (overlayPictures), which MapLibre waits on before it lays the tile out.
  m.setMissingStyleImageResolver(async (id) => {
    await picturesDrawn;
    const got = pictures?.get(id);
    if (got && !m.hasImage(id)) m.addImage(id, got.image, got.options);
  });
  m.setPadding(padOf(insets));
  // A tile 404 left blank; any other failure said and reported (mapErrors).
  watchMapErrors(m);
  // Fewer pixels where WebGL is drawn without a graphics chip (softwareGl).
  fewerPixelsOnSoftware(m);
  // Whether it is moving, on its element, for the browser tests to wait
  // on a still map (e2e helpers' mapStill).
  const el = holder;
  m.on("movestart", () => {
    el.dataset.moving = "";
  });
  // And where it is: its middle, and where the point it opened on is on
  // the screen now, and the layers drawn
  // bottom to top.
  const anchor = m.getCenter();
  const say = () => {
    const c = m.getCenter(),
      p = m.project(anchor);
    el.dataset.center = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
    el.dataset.offset = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    // In the app's levels (MapLibre's zoom plus one, glStyle).
    el.dataset.zoom = (m.getZoom() + 1).toFixed(3);
  };
  say();
  m.on("moveend", () => {
    delete el.dataset.moving;
    say();
  });
  probeLayers(m, el);
  m.once("load", () => loaded.add(m));
  // Once at rest, the overlay tiles one ring outside the view fetched
  // (overlayTiles' prefetchRing), so a pan's first frame has them; again
  // at each rest after, for the tiles not fetched yet.
  m.on("idle", () => {
    const tiles = overlaysOf.get(m);
    if (!tiles) return;
    const b = m.getBounds();
    prefetchRing(tiles, { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, m.getZoom());
  });
  // The map shown as one thing (the owner, 2026-11-07): the canvas clear
  // over the page's background until the map is first at rest with the
  // chart's tiles drawn (none to wait for with the chart None) and the
  // overlay tiles' first ones in, then faded in once; never longer than
  // REVEAL_LATEST_MS, so a slow tile never leaves the map blank.
  const canvas = m.getCanvas();
  canvas.style.opacity = "0";
  let chartIn = usePreferences.getState().base === "none";
  let overlaysIn = !tiles;
  const tileIn = (e: { sourceId?: string; tile?: unknown }) => {
    if (!e.tile) return;
    if (e.sourceId?.startsWith("chart")) chartIn = true;
    if (e.sourceId === OVERLAY_SOURCE) overlaysIn = true;
  };
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    window.clearTimeout(latest);
    // Under Reduce Motion index.css stills it (its !important beats this).
    canvas.style.transition = `opacity ${REVEAL_FADE_MS}ms ease-out`;
    canvas.style.opacity = "1";
    el.dataset.revealed = "";
    // For the page's loading mark (MapLoading) to fade as the map comes in.
    el.dispatchEvent(new Event(REVEAL_EVENT));
  };
  // Ready at its first rest with those tiles drawn, whether or not
  // REVEAL_LATEST_MS showed it first: marked once a page for Setup's Log
  // (lib/loadLog), whose probes stop there.
  const rested = () => {
    if (!chartIn || !overlaysIn) return;
    m.off("sourcedata", tileIn);
    m.off("idle", rested);
    if (!performance.getEntriesByName("map-ready").length) performance.mark("map-ready");
    reveal();
  };
  const latest = window.setTimeout(reveal, REVEAL_LATEST_MS);
  m.on("sourcedata", tileIn);
  m.on("idle", rested);
  return m;
}
