import * as maplibregl from "maplibre-gl";
import type { LayerSpecification, PaddingOptions, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker MapLibre parses its sources in (worker.ts).
import "../../lib/map/gl/worker";
// The app's own typeface for the map's words (MapLibre draws them from
// the font file, no glyph server): the Latin subset the page loads.
import interUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import type { MapInsets } from "../../lib/mapChrome";
import { watchMapErrors } from "./mapErrors";
import type { OverlayTiles } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { overlayTilesQuery, queryClient } from "../../lib/queryClient";
import { prefetchRing, registerOverlayProtocol } from "../../lib/map/sources/overlayTiles";
import { COUNTRY_ZOOM, OPEN_ZOOM, useOwnShip } from "../../lib/map/position/ownShip";
import { SLOTS, slotId, type DrawnImage, type Slot } from "../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE, overlayPictures, overlayStyle } from "../../lib/map/gl/glOverlays";
import { glZoom } from "../../lib/map/gl/glStyle";
import { probeLayers } from "../../lib/map/gl/useGlProbe";

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
export function padOf({ top, bottom, left }: MapInsets): Required<PaddingOptions> {
  return { top, bottom, left, right: 0 };
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
    sources: overlays ? { [OVERLAY_SOURCE]: overlays.source } : {},
    layers,
    // The same variable font under a second name: MapLibre draws a name
    // with "Bold" in it at weight 700 (GL_FONT_BOLD, the chart's labels).
    "font-faces": {
      Inter: [{ url: interUrl, "unicode-range": ["U+0000-00FF", "U+2000-206F"] }],
      "Inter Bold": [{ url: interUrl, "unicode-range": ["U+0000-00FF", "U+2000-206F"] }],
    },
  };
  const m = new maplibregl.Map({
    container: holder,
    style,
    center: [lon, lat],
    zoom: glZoom(last ? OPEN_ZOOM : COUNTRY_ZOOM),
    minZoom: glZoom(3),
    attributionControl: false,
    // A chart is read north up: no turn, no tilt.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    // MapLibre's own keys (its default: arrows pan, + and - zoom).
    // Symbols placed at once, not faded in over 0.3 s.
    fadeDuration: 0,
    // And its world copies (its default): the Western Aleutian sectional runs across 180°.
  });
  if (tiles) overlaysOf.set(m, tiles);
  // A tile's picture from those drawn ahead (overlayPictures), which MapLibre waits on before it lays the tile out.
  m.setMissingStyleImageResolver(async (id) => {
    await picturesDrawn;
    const got = pictures?.get(id);
    if (got && !m.hasImage(id)) m.addImage(id, got.image, got.options);
  });
  m.touchZoomRotate.disableRotation();
  m.keyboard.disableRotation();
  m.setPadding(padOf(insets));
  // A tile 404 left blank; any other failure said and reported (mapErrors).
  watchMapErrors(m);
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
  const reveal = () => {
    m.off("sourcedata", tileIn);
    m.off("idle", rested);
    window.clearTimeout(latest);
    // Under Reduce Motion index.css stills it (its !important beats this).
    canvas.style.transition = `opacity ${REVEAL_FADE_MS}ms ease-out`;
    canvas.style.opacity = "1";
    el.dataset.revealed = "";
    // For the page's loading mark (MapLoading) to fade as the map comes in.
    el.dispatchEvent(new Event(REVEAL_EVENT));
  };
  const rested = () => {
    if (chartIn && overlaysIn) reveal();
  };
  const latest = window.setTimeout(reveal, REVEAL_LATEST_MS);
  m.on("sourcedata", tileIn);
  m.on("idle", rested);
  return m;
}
