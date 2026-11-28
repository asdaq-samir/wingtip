import type * as maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapControls from "../MapControls";
import MapBanners from "../MapBanners";
import MapLoading from "../MapLoading";
import { SHEET_SECONDS, roomAsCardOpens, useMapInsets, type MapInsets } from "../../lib/mapChrome";
import { SheetCard } from "../SheetCard";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";
import { useRouteFit } from "./useRouteFit";
import { useIsMobile } from "../../hooks/use-mobile";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { useTappedInSight } from "./cardRoom";
import { useSheetSlide } from "./useSheetSlide";
import { REVEAL_EVENT, STYLE_LOADED, loaded, makeMap, overlaysOf, padOf, picturesDrawn, picturesReady } from "./makeMap";
import type { Course } from "../../lib/api/types";
import { engineLoaded } from "../../lib/engine/engine";
import { chartQuery, overlayTilesQuery } from "../../lib/queryClient";
import { CardCloseContext } from "../../lib/map/cards/cardClose";
import { GlMapContext, adoptLayers, parkLayers, sweepLayers, pickTap, type GlMapApi, type GlTap } from "../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE, addOverlays } from "../../lib/map/gl/glOverlays";
import { watchOverlayFilters } from "../../lib/map/gl/overlayFilters";
import { glZoom } from "../../lib/map/gl/glStyle";
import { RulerGl } from "../../lib/map/gl/layers/RulerGl";
import { cameraOf } from "../../lib/map/gl/camera";
import { PICK_ZOOM, pickOnMap, putAwayPicks, useMapPickOwner, type PickKind } from "../../lib/map/mapPick";

/** The longest the map waits, before it is made, for the overlay tiles'
 *  name and the overlays' pictures to put in its first style: past it, it
 *  is made without them and they come in as they arrive. */
const FIRST_STYLE_WAIT_MS = 1500;
/** How long a map left by one page's tree waits for the next to take it
 *  up (the map drawn before the engine, handed to the planner's), before
 *  it is let go. */
const PARK_MS = 10_000;
const flight = () => SHEET_SECONDS * 1000 * 2;

/** The map handed from one tree to the next, its element with it. */
let parked: { map: maplibregl.Map; holder: HTMLDivElement; timer: number } | null = null;

interface Props {
  course: Course | null;
  /** A point picked (a checkpoint, a route point, the Nav Log's row): the
   *  map brought to it as an airport's card brings its field, in to
   *  `focusZoom` at least where it was not tapped. */
  focus: { lat: number; lon: number } | null;
  focusZoom: number;
  /** The airport whose card is open: the map flies to it. */
  place: { lat: number; lon: number } | null;
  /** Its layers (lib/map/gl/layers), drawn once the map is made. */
  children: ReactNode;
  /** The map alone, while a route in the address waits for the engine
   *  (GlBootMap): no buttons, banners or ruler, and no taps until it is. */
  bare?: boolean;
  /** Made with the Class C and D rings kept to the fields drawn
   *  (makeMap's `ringsByField`): the planner's maps, the boot map handed
   *  to it among them, whose airports keep them so (placedRings). */
  ringsByField?: boolean;
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
export default function GlMapShell({ course, focus, focusZoom, place, children, bare = false, ringsByField = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [overlays, setOverlays] = useState(false);
  // Whether the map is shown yet: till then, the loading mark in its middle.
  const [revealed, setRevealed] = useState(() => !!parked && "revealed" in parked.holder.dataset);
  const insets = useMapInsets();
  const insetsRef = useRef(insets);
  // Read as the map is made, once (a map lives on from tree to tree).
  const ringsRef = useRef(ringsByField);
  // What a tap opened a card for, brought into sight once the card is up if it hides it.
  const { note: noteTap, take: takeTap } = useTappedInSight(map, insetsRef, padOf);
  const { data: chartOnly } = useQuery({ ...chartQuery, enabled: !course });
  const known = !!(course ?? chartOnly);
  // The overlay tiles' name and the overlays' pictures, for the map's
  // first style, each waited for at most FIRST_STYLE_WAIT_MS.
  const { status: tilesStatus, data: tiles } = useQuery(overlayTilesQuery);
  const [drawnPictures, setDrawnPictures] = useState(picturesReady);
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
      holder.className = "h-full w-full bg-(--chart-map-ground) dark:bg-(--chart-map-ground-night)";
      holder.dataset.testid = "gl-map";
      host.appendChild(holder);
      m = makeMap(holder, insetsRef.current, ringsRef.current);
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
      // The camera's one owner (lib/map/gl/camera), made with the map so it
      // hears the pilot's first drag.
      cameraOf(m);
      setOverlays(!!m.getSource(OVERLAY_SOURCE));
      setMap(m);
    };
    if (loaded.has(m)) take();
    else m.once(STYLE_LOADED, take);
    // A map taken up from the last tree is shown already.
    const shown = () => setRevealed(true);
    if ("revealed" in holder.dataset) shown();
    else holder.addEventListener(REVEAL_EVENT, shown, { once: true });
    return () => {
      m.off(STYLE_LOADED, take);
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
  }, [ready]);

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
  // What was picked with the card (a checkpoint's ring, lib/map/mapPick),
  // put away with it, so its ✕ leaves no ring on the map.
  // Held in state, not a ref, as the taps' registry is: read only in the
  // handlers.
  const [companions] = useState(() => new Set<PickKind>());
  const closeCard = useCallback(() => {
    setCard(null);
    const also = [...companions];
    companions.clear();
    putAwayPicks(also);
  }, [companions]);
  // A card opened from the map: one pick, every other kind's card and
  // ring put away first (lib/map/mapPick); null puts it away.
  const openCard = useCallback(
    (next: ReactNode | null, also: readonly PickKind[] = []) => {
      if (!next) return closeCard();
      pickOnMap(["card", ...also]);
      companions.clear();
      for (const kind of also) companions.add(kind);
      setCard(next);
    },
    [closeCard, companions],
  );
  useMapPickOwner("card", !!card, closeCard);
  useEffect(() => {
    if (!map) return;
    const tap = (e: MapMouseEvent) => {
      // The cards a tap opens ask the engine as they draw: a tap waits for
      // it, as the layers that draw with it do (GlRouteMap's EngineLayers).
      if (!engineLoaded()) return;
      const picked = pickTap(map, registry.taps, e.point);
      if (picked) {
        noteTap(e.lngLat.toArray());
        picked.tap.onTap(picked.hit, e);
        return;
      }
      // The chart itself tapped: every card and ring open put away
      // (lib/map/mapPick), the map's own with them.
      pickOnMap(null);
      for (const miss of registry.misses) miss(e);
    };
    map.on("click", tap);
    return () => {
      map.off("click", tap);
    };
  }, [map, registry, noteTap]);
  const api = useMemo<GlMapApi | null>(
    () => (map ? { map, addTap, addMiss, openCard, overlays } : null),
    [map, addTap, addMiss, openCard, overlays],
  );
  // The last tree's layers this one has not drawn again, taken away once
  // its own are in (children's effects run before this one's).
  useEffect(() => {
    if (api) sweepLayers(api.map);
  }, [api]);

  // Fit to the route: once for each set of its points, clear of the panel
  // and the buttons, and aimed again as the sheet turns under it (the
  // camera's room).
  useRouteFit(map, course, insetsRef, flight());

  // The map follows the sheet: MapLibre's padding is what the panel
  // covers, eased in the sheet's own time, so what was in the middle of
  // the room left stays in the middle -- told as the sheet sets off, its
  // snap point set (MapPanel's insets). Only padded, never fitted again:
  // the sheet moving is no pick (the owner, 2026-11-11, "I like the stock
  // behavior": Apple Maps slides its map with the sheet and leaves its
  // zoom alone). A route's fit or a point picked still on its way is aimed
  // again at the room now left by the camera's owner, not stopped by a
  // second move.
  const sliding = useSheetSlide(map, insetsRef);
  const onPhone = useIsMobile();
  const follow = useCallback(
    (to: MapInsets) => {
      const was = insetsRef.current;
      insetsRef.current = to;
      if (!map || (was.top === to.top && was.bottom === to.bottom && was.left === to.left && was.right === to.right)) return;
      // The sheet moving slides the map with it, frame by frame, and sets
      // this room once it has settled (useSheetSlide).
      if (sliding() && !to.card && !was.card) return;
      // A card come or gone: its room is the map's from now on, the chart
      // kept where it is under it, what was tapped brought into sight once
      // the card is up if it hides it (useTappedInSight). Half way to all
      // the way up and back the map stays put. A desktop's side panel put
      // in to its pill or out again leaves the chart where it is too, as
      // Maps on a Mac leaves its map as the sidebar comes and goes: its
      // room's middle moves across and up the window, and eased there the
      // route slid half under the pill, the pill's height told a render
      // after its size (route-fit.spec's desktop runs, 2026-11-19). Own
      // ship followed stays in the middle of the room, as on a phone.
      const own = useOwnShip.getState();
      const card = !!(to.card || was.card);
      const still = card || (!onPhone && !(own.enabled && own.follow));
      const how = still ? "still" : to.up !== was.up && to.out === was.out ? "set" : "ease";
      cameraOf(map).room(padOf(to), how, { duration: DRAWER_MS, easing: drawerEasing }, card);
    },
    [map, sliding, onPhone],
  );
  // Told as the room changes, in the store's own call, not a render and an
  // effect later.
  useEffect(() => {
    follow(useMapInsets.getState());
    return useMapInsets.subscribe(follow);
  }, [follow]);

  // A thing picked -- an airport's card, a route point's or a checkpoint's,
  // the Nav Log's row -- centred in the room above the card's detent as the
  // card starts up, in the commit that opens it: one move, centre and
  // padding together, on the sheet's curve and time (the owner,
  // 2026-11-17: "It should be instant"). The room is the detent the card
  // opens at (half, cardOpening; or the inspector's column), known as it
  // opens, not measured once it is up, as it was: the map waited for the
  // card to settle and moved after it, 820 ms after the tap on a phone's
  // CPU. One rule for every kind (rules.md
  // §14):
  // a thing tapped keeps the pilot's zoom; one picked elsewhere is
  // brought in to `zoom` at least (PICK_ZOOM), and flown to if it is off
  // the screen. A route point's was its own, in to the chart's last zoom
  // at twice the sheet's time with no room for the card, so it could land
  // under it.
  const bringIn = useCallback(
    (point: { lat: number; lon: number } | null, zoom: number) => {
      if (!map || !point) return;
      const at: [number, number] = [point.lon, point.lat];
      const tapped = takeTap();
      const pad = roomAsCardOpens(padOf(insetsRef.current));
      const p = map.project(at),
        box = map.getContainer();
      const near = !!tapped || (p.x >= 0 && p.y >= 0 && p.x <= box.clientWidth && p.y <= box.clientHeight);
      cameraOf(map).pick(at, {
        zoom: tapped ? map.getZoom() : Math.max(map.getZoom(), glZoom(zoom)),
        pad,
        duration: near ? DRAWER_MS : flight(),
        easing: drawerEasing,
      });
    },
    [map, takeTap],
  );
  useEffect(() => {
    bringIn(focus, focusZoom);
  }, [bringIn, focus, focusZoom]);
  useEffect(() => {
    bringIn(place, PICK_ZOOM);
  }, [bringIn, place]);

  return (
    <div className="relative h-full w-full">
      {/* The map's own element (data-testid gl-map) is made with the map and
          goes with it from tree to tree (makeMap, parked). */}
      <div ref={box} className="h-full w-full bg-(--chart-map-ground) dark:bg-(--chart-map-ground-night)" />
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
      {!bare && <MapControls map={map} />}
    </div>
  );
}
