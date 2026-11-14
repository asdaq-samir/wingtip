import * as maplibregl from "maplibre-gl";
import type { LayerSpecification, MapMouseEvent, PaddingOptions, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker MapLibre parses its sources in (worker.ts).
import "../../lib/map/gl/worker";
// The app's own typeface for the map's words (MapLibre draws them from
// the font file, no glyph server): the Latin subset the page loads.
import interUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapControls from "../MapControls";
import MapBanners from "../MapBanners";
import MapLoading from "../MapLoading";
import { SHEET_SECONDS, useMapInsets, type MapInsets } from "../../lib/mapChrome";
import { SheetCard } from "../SheetCard";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";
import { watchMapErrors } from "./mapErrors";
import { useRouteFit } from "./useRouteFit";
import { inRoom, keepStill, useTappedInSight } from "./cardRoom";
import type { Course, OverlayTiles } from "../../lib/api/types";
import { engineLoaded } from "../../lib/engine/engine";
import { chartQuery, overlayTilesQuery, queryClient } from "../../lib/queryClient";
import { CardCloseContext } from "../../lib/map/cards/cardClose";
import { prefetchRing, registerOverlayProtocol } from "../../lib/map/sources/overlayTiles";
import { COUNTRY_ZOOM, OPEN_ZOOM, useOwnShip } from "../../lib/map/position/ownShip";
import {
  GlMapContext,
  SLOTS,
  adoptLayers,
  parkLayers,
  slotId,
  sweepLayers,
  tapHit,
  type DrawnImage,
  type GlMapApi,
  type GlTap,
  type Slot,
} from "../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE, addOverlays, overlayPictures, overlayStyle } from "../../lib/map/gl/glOverlays";
import { watchOverlayFilters } from "../../lib/map/gl/overlayFilters";
import { glZoom } from "../../lib/map/gl/glStyle";
import { probeLayers } from "../../lib/map/gl/useGlProbe";
import { RulerGl } from "../../lib/map/gl/layers/RulerGl";
import { picked, watchPilotMoves } from "../../lib/map/gl/pilotCamera";
import { tvPlatform, zoomInKey, zoomOutKey } from "../../lib/tv";

const COUNTRY: [number, number] = [39.5, -98.35];
/** RouteMap's: how close in an airport's card brings the map. */
const PLACE_ZOOM = 9;
/** The map's first showing (GlMap's reveal): at the latest this long after
 *  it is made, faded in over this long. */
const REVEAL_LATEST_MS = 2500;
const REVEAL_FADE_MS = 150;
/** The longest the map waits, before it is made, for the overlay tiles'
 *  name and the overlays' pictures to put in its first style: past it, it
 *  is made without them and they come in as they arrive. */
const FIRST_STYLE_WAIT_MS = 1500;
/** How long a map left by one page's tree waits for the next to take it
 *  up (the map drawn before the engine, handed to the planner's), before
 *  it is let go. */
const PARK_MS = 10_000;
/** Sent on the map's element as it is first shown (makeMap's reveal). */
const REVEAL_EVENT = "mapreveal";
const flight = () => SHEET_SECONDS * 1000 * 2;

// The overlay tiles' protocol, once for the page (lib/map/sources/overlayTiles).
registerOverlayProtocol(maplibregl);

/** The overlays' pictures, once drawn (glOverlays' overlayPictures), for
 *  every map to take as a tile asks for one. */
let pictures: Map<string, DrawnImage> | null = null;
const picturesDrawn = overlayPictures().then(
  (p) => {
    pictures = p;
  },
  () => {
    pictures = new Map();
  },
);

/** The overlay tiles each map draws, for its prefetch round the view. */
const overlaysOf = new WeakMap<maplibregl.Map, OverlayTiles>();

/** The map handed from one tree to the next, its element with it. */
let parked: { map: maplibregl.Map; holder: HTMLDivElement; timer: number } | null = null;
/** The maps whose style has loaded. */
const loaded = new WeakSet<maplibregl.Map>();

/**
 * A map made in `holder`, at the pilot's last position or the country, in
 * the middle of what the panel leaves (padding), its first style the
 * slots' empty layers with the cycle's FAA overlays (glOverlays) among
 * them, so the airspace, the airports and the navaids load per tile with
 * the chart rather than each asking the planner for the view.
 */
function makeMap(holder: HTMLDivElement, onTv: boolean, insets: MapInsets): maplibregl.Map {
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
    // MapLibre's own keys everywhere (its default: arrows pan, + and - zoom), not only a TV's.
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
  // A remote has no pinch: the map's own + and - to reach with its arrows.
  if (onTv) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
  // The map shown as one thing (the owner, 2026-11-07: the chart, then
  // the rings, then the airports snapping on one by one): the canvas
  // kept clear over the page's background until the map is first at
  // rest with the chart's tiles drawn and the overlay tiles' first ones
  // in, then faded in once; never longer than REVEAL_LATEST_MS, so a
  // slow tile never leaves the map blank.
  const canvas = m.getCanvas();
  canvas.style.opacity = "0";
  let chartIn = false;
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

interface Props {
  course: Course | null;
  /** A checkpoint picked: the map flies to it, in to `focusZoom`. */
  focus: { lat: number; lon: number } | null;
  focusZoom: number;
  /** The airport whose card is open: the map flies to it. */
  place: { lat: number; lon: number } | null;
  /** Its layers (lib/map/gl/layers), drawn once the map is made. */
  children: ReactNode;
  /** The map alone, while a route in the address waits for the engine
   *  (GlBootMap): no buttons, banners or ruler, and no taps until it is. */
  bare?: boolean;
}

/**
 * The WebGL map (MapLibre GL): the container, the camera and what moves
 * it -- a route's fit, a point picked, the sheet -- and the one tap the
 * layers share (glLayer). Every layer is a child: the chart, the
 * airspace, the route, own ship. Every map of the app is one: the planner's
 * (GlRouteMap) and the training page's (ChartMap).
 *
 * The map follows the sheet with MapLibre's own padding: the middle of
 * what the sheet leaves stays the middle, eased in the sheet's own time
 * as the sheet's snap point is set (MapPanel's insets), and a route is fitted to
 * what the sheet leaves, clear of the map's buttons.
 *
 * One MapLibre map lives on from one tree to the next: the map the page
 * draws while a route in the address waits for the engine (GlBootMap) is
 * parked as that tree goes and taken up by the planner's, its chart and
 * overlays kept, rather than a second map drawn from nothing.
 */
export default function GlMapShell({ course, focus, focusZoom, place, children, bare = false }: Props) {
  // Once: a page is on a TV or not for its whole visit.
  const [onTv] = useState(() => tvPlatform() !== null);
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [overlays, setOverlays] = useState(false);
  // Whether the map is shown yet: till then, the loading mark in its middle.
  const [revealed, setRevealed] = useState(() => !!parked && "revealed" in parked.holder.dataset);
  const insets = useMapInsets();
  const insetsRef = useRef(insets);
  // Where a point picked is being flown to (flyTo below), for the sheet
  // turning under the flight to aim it again rather than stop it.
  const flying = useRef<{ center: [number, number]; zoom: number } | null>(null);
  // What a tap opened a card for, brought into sight once the card is up if it hides it.
  const noteTap = useTappedInSight(map, insetsRef, padOf, flying);
  const { data: chartOnly } = useQuery({ ...chartQuery, enabled: !course });
  const known = !!(course ?? chartOnly);
  // The overlay tiles' name and the overlays' pictures, for the map's
  // first style, each waited for at most FIRST_STYLE_WAIT_MS.
  const { status: tilesStatus, data: tiles } = useQuery(overlayTilesQuery);
  const [drawnPictures, setDrawnPictures] = useState(() => pictures !== null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    let live = true;
    void picturesDrawn.then(() => {
      if (live) setDrawnPictures(true);
    });
    const timer = window.setTimeout(() => setWaited(true), FIRST_STYLE_WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);
  const ready = known && ((drawnPictures && tilesStatus !== "pending") || waited);

  // Made once the chart is known (makeMap), or the map the last tree left
  // taken up.
  useEffect(() => {
    const host = box.current;
    if (!host || !ready) return;
    const held = parked;
    parked = null;
    let m: maplibregl.Map, holder: HTMLDivElement;
    if (held) {
      window.clearTimeout(held.timer);
      ({ map: m, holder } = held);
      host.appendChild(holder);
      adoptLayers(m);
      m.resize();
      m.setPadding(padOf(insetsRef.current));
    } else {
      holder = document.createElement("div");
      holder.className = "h-full w-full bg-slate-100 dark:bg-slate-900";
      holder.dataset.testid = "gl-map";
      host.appendChild(holder);
      m = makeMap(holder, onTv, insetsRef.current);
    }
    // Whether its first style has the overlay tiles: a map made without
    // them (no archive yet, or its name too slow to come) has them added
    // once they come (below), and draws no overlays till then.
    const take = () => {
      // The sheet's room as it is now: follow() moves only a map it has,
      // so a sheet that settled while this one loaded left it padded for
      // the sheet as it was, and the pilot's position off the middle --
      // below the loading mark (MapLoading), which keeps to the sheet.
      m.setPadding(padOf(insetsRef.current));
      setOverlays(!!m.getSource(OVERLAY_SOURCE));
      setMap(m);
    };
    if (loaded.has(m)) take();
    else m.once("load", take);
    // A map taken up from the last tree is shown already.
    const shown = () => setRevealed(true);
    if ("revealed" in holder.dataset) shown();
    else holder.addEventListener(REVEAL_EVENT, shown, { once: true });
    return () => {
      m.off("load", take);
      holder.removeEventListener(REVEAL_EVENT, shown);
      setMap(null);
      // Kept a moment for the next tree to take up, then let go.
      parkLayers(m);
      holder.remove();
      parked = {
        map: m,
        holder,
        timer: window.setTimeout(() => {
          if (parked?.map === m) parked = null;
          m.remove();
        }, PARK_MS),
      };
    };
  }, [ready, onTv]);

  // The overlay tiles added to a map made without them, once their name
  // comes: the airspace, airports and navaids are the tiles' alone.
  useEffect(() => {
    if (!map || overlays || !tiles) return;
    // Said once the style has taken them (its styledata), for the layers'
    // taps and probes to find them.
    const taken = () => setOverlays(true);
    map.once("styledata", taken);
    addOverlays(map, tiles);
    overlaysOf.set(map, tiles);
    return () => {
      map.off("styledata", taken);
    };
  }, [map, overlays, tiles]);

  // The settings' filters on the overlay tiles as they change, and the
  // emergency's (watchOverlayFilters).
  useEffect(() => (map && overlays ? watchOverlayFilters(map) : undefined), [map, overlays]);

  // A remote has no pinch: its zoom keys zoom the map while it is focused.
  useEffect(() => {
    if (!map || !onTv) return;
    const container = map.getCanvasContainer();
    const onKey = (event: KeyboardEvent) => {
      if (zoomInKey(event)) map.zoomIn();
      else if (zoomOutKey(event)) map.zoomOut();
      else return;
      event.preventDefault();
    };
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [map, onTv]);
  // The one tap: the nearest thing's, in the taps' rank order.
  // Held in state, not refs: made once, read in the map's own handler.
  const [registry] = useState(() => ({ taps: new Set<GlTap>(), misses: new Set<(event: MapMouseEvent) => void>() }));
  const addTap = useCallback(
    (tap: GlTap) => {
      registry.taps.add(tap);
      return () => {
        registry.taps.delete(tap);
      };
    },
    [registry],
  );
  const addMiss = useCallback(
    (miss: (event: MapMouseEvent) => void) => {
      registry.misses.add(miss);
      return () => {
        registry.misses.delete(miss);
      };
    },
    [registry],
  );
  const [card, setCard] = useState<ReactNode | null>(null);
  const closeCard = useCallback(() => setCard(null), []);
  useEffect(() => {
    if (!map) return;
    const tap = (e: MapMouseEvent) => {
      // The cards a tap opens ask the engine as they draw: a tap waits for
      // it, as the layers that draw with it do (GlRouteMap's EngineLayers).
      if (!engineLoaded()) return;
      for (const t of [...registry.taps].sort((a, b) => a.rank - b.rank)) {
        const hit = tapHit(map, t, e.point);
        if (hit) {
          noteTap(e.lngLat);
          t.onTap(hit, e);
          return;
        }
      }
      // The chart itself tapped: a card open is put away.
      setCard(null);
      for (const miss of registry.misses) miss(e);
    };
    map.on("click", tap);
    return () => {
      map.off("click", tap);
    };
  }, [map, registry, noteTap]);
  const api = useMemo<GlMapApi | null>(
    () => (map ? { map, addTap, addMiss, openCard: setCard, overlays } : null),
    [map, addTap, addMiss, overlays],
  );
  // The last tree's layers this one has not drawn again, taken away once
  // its own are in (children's effects run before this one's).
  useEffect(() => {
    if (api) sweepLayers(api.map);
  }, [api]);

  // Fit to the route: once for each set of its points, clear of the panel
  // and the buttons, and aimed again as the sheet turns under it (useRouteFit).
  const aimFitAgain = useRouteFit(map, course, insetsRef, padOf, flight());

  // The map follows the sheet: MapLibre's padding is what the panel
  // covers, eased in the sheet's own time, so what was in the middle of
  // the room left stays in the middle -- told as the sheet sets off, its
  // snap point set (MapPanel's insets). Only padded, never fitted again:
  // the sheet moving is no pick (the owner, 2026-11-11, "I like the stock
  // behavior": Apple Maps slides its map with the sheet and leaves its
  // zoom alone).
  const follow = useCallback(
    (to: MapInsets) => {
      const was = insetsRef.current;
      insetsRef.current = to;
      if (!map || (was.top === to.top && was.bottom === to.bottom && was.left === to.left)) return;
      // A route's fit still flying: aimed again at the room now left.
      if (aimFitAgain(to)) return;
      // A point still being flown to (a checkpoint tapped, whose card is what
      // turned the sheet): the flight aimed again with the new padding. A
      // second camera move stops MapLibre's first where it is, so an ease of
      // the padding alone left the map near the route's whole view, never
      // in to the point.
      const aim = flying.current;
      if (aim && map.isMoving()) {
        map.flyTo({ ...aim, padding: padOf(to), duration: DRAWER_MS });
        return;
      }
      // A card come or gone: its room is the map's from now on, the chart
      // kept where it is under it (cardRoom), what was tapped brought into
      // sight once the card is up if it hides it (useTappedInSight).
      if (to.card || was.card) {
        keepStill(map, padOf(to));
        return;
      }
      // Half way to all the way up and back the map stays put.
      if (to.up !== was.up && to.out === was.out) {
        map.setPadding(padOf(to));
        return;
      }
      map.easeTo({ padding: padOf(to), duration: DRAWER_MS, easing: drawerEasing });
    },
    [map, aimFitAgain],
  );
  useEffect(() => {
    follow(insets);
  }, [insets, follow]);

  // A point picked -- a checkpoint, an airport's card -- flown to, in
  // close enough, as FocusOn; own ship stops pulling the map back.
  const flyTo = useCallback(
    (point: { lat: number; lon: number } | null, zoom: number) => {
      if (!map || !point) return;
      picked();
      const ownShip = useOwnShip.getState();
      if (ownShip.enabled && ownShip.follow) ownShip.setFollow(false);
      flying.current = { center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), glZoom(zoom)) };
      map.flyTo({ ...flying.current, duration: flight() });
    },
    [map],
  );
  // The flight's aim is let go once the map is at rest, or the pilot moves
  // it by hand. Not at the moveend a flight aimed again fires: MapLibre
  // stops the old one and starts the new in the same call, so the map is
  // moving again by the next microtask.
  useEffect(() => {
    if (!map) return;
    const rested = () =>
      queueMicrotask(() => {
        if (!map.isMoving()) flying.current = null;
      });
    // Moved by hand, the map is the pilot's until they next pick something
    // (lib/map/gl/pilotCamera).
    const byHand = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) flying.current = null;
    };
    map.on("moveend", rested);
    map.on("movestart", byHand);
    const unwatch = watchPilotMoves(map);
    return () => {
      map.off("moveend", rested);
      map.off("movestart", byHand);
      unwatch();
    };
  }, [map]);
  useEffect(() => {
    flyTo(focus, focusZoom);
  }, [flyTo, focus, focusZoom]);
  // A field tapped on the chart is in sight already: not flown to, only
  // brought into the card's room once its card is up, if the card hides it
  // (useTappedInSight). One picked elsewhere -- the search, a list, a link
  // -- is flown to.
  useEffect(() => {
    if (map && place && map.getZoom() >= glZoom(PLACE_ZOOM) && inRoom(map, [place.lon, place.lat], padOf(insetsRef.current))) {
      noteTap([place.lon, place.lat]);
      return;
    }
    flyTo(place, PLACE_ZOOM);
  }, [map, flyTo, place, noteTap]);

  return (
    <div className="relative h-full w-full">
      {/* The map's own element (data-testid gl-map) is made with the map and
          goes with it from tree to tree (makeMap, parked). */}
      <div ref={box} className="h-full w-full bg-slate-100 dark:bg-slate-900" />
      <MapLoading shown={!revealed} insets={insets} />
      {api && (
        <GlMapContext.Provider value={api}>
          {children}
          {/* Two fingers held on the chart measure it, on every map. */}
          {!bare && <RulerGl />}
        </GlMapContext.Provider>
      )}
      {card && (
        <SheetCard onClose={closeCard}>
          <CardCloseContext.Provider value={closeCard}>{card}</CardCloseContext.Provider>
        </SheetCard>
      )}
      {!bare && <MapBanners map={map} />}
      {!bare && <MapControls />}
    </div>
  );
}

/** What the panel covers, as MapLibre's padding: its middle is the map's. */
function padOf({ top, bottom, left }: MapInsets): Required<PaddingOptions> {
  return { top, bottom, left, right: 0 };
}
