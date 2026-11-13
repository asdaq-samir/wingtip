import type * as maplibregl from "maplibre-gl";
import type { LngLatLike, PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { MapInsets } from "../../lib/mapChrome";
import { FIT_MARGIN } from "../../lib/map/clear";
import { picked, pilotMoved } from "../../lib/map/gl/pilotCamera";
import { useSheetTop } from "../sheet/sheetTopSlot";
import { useFloatRoom } from "../sheet/floatRoom";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";

/** The least of the screen a floating card leaves the chart, for the
 *  map to make room beside it: one nearly all the way up (Emergency) is
 *  read over, the map left as it is under it. */
const LEAST_ROOM = 0.25;

/** What the floating cards open cover of the map, as MapLibre's padding:
 *  each the side it leaves the most of the screen beside -- a phone's,
 *  ten points in from the sides and foot, the bottom; a wider screen's,
 *  in the side panel's corner, the left -- in the page's frame, as the
 *  panel's insets are (the map fills the page). */
function floatCover(): Required<PaddingOptions> {
  const pad = { top: 0, bottom: 0, left: 0, right: 0 };
  const width = window.innerWidth,
    height = window.innerHeight;
  for (const b of Object.values(useFloatRoom.getState().boxes)) {
    const sides: [keyof typeof pad, number, number][] = [
      ["bottom", height - b.top, b.top / height],
      ["top", b.top + b.height, (height - b.top - b.height) / height],
      ["left", b.left + b.width, (width - b.left - b.width) / width],
      ["right", width - b.left, b.left / width],
    ];
    const [side, cover, room] = sides.reduce((best, s) => (s[2] > best[2] ? s : best));
    if (room >= LEAST_ROOM) pad[side] = Math.max(pad[side], cover);
  }
  return pad;
}

/** The room the chart is given, as MapLibre's padding: what the panel
 *  covers (its middle is the map's), and what a floating card covers
 *  beyond it, so what the map keeps in sight is kept beside the card. */
export function padOf({ top, bottom, left }: MapInsets): Required<PaddingOptions> {
  const float = floatCover();
  return { top: Math.max(top, float.top), bottom: Math.max(bottom, float.bottom), left: Math.max(left, float.left), right: float.right };
}

/** How long a tap waits for the card it opens to come up, ms: past it the
 *  tap is old news and a card that comes up later moves nothing. */
const TAP_WAITS_MS = 3000;

/**
 * The map's room changed for a card coming or going, the view kept still:
 * MapLibre's padding set to the room now left, with the centre moved to
 * what is at the middle of that room already, so nothing on the chart
 * moves. Easing the padding as the sheet's own size does slid the chart
 * under the pilot's finger at every card (the owner's iPhone, 2026-11-12:
 * "Why are all the cards jumping like this?" -- the map panned as the TFR's
 * card opened, again as it changed height, and again as it closed).
 */
export function keepStill(map: maplibregl.Map, pad: Required<PaddingOptions>) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const middle = map.unproject([pad.left + (width - pad.left - pad.right) / 2, pad.top + (height - pad.top - pad.bottom) / 2]);
  map.jumpTo({ center: middle, padding: pad });
}

/** Whether `at` is in the room `pad` leaves the chart, clear of the map's
 *  buttons along its edges (FIT_MARGIN). */
export function inRoom(map: maplibregl.Map, at: LngLatLike, pad: Required<PaddingOptions>): boolean {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const p = map.project(at);
  return (
    p.x >= pad.left + FIT_MARGIN.left &&
    p.x <= width - pad.right - FIT_MARGIN.right &&
    p.y >= pad.top + FIT_MARGIN.top &&
    p.y <= height - pad.bottom - FIT_MARGIN.bottom
  );
}

/**
 * What a tap on the chart opened a card for, kept in sight as Apple Maps
 * keeps a place it opens: once the card has come up (sheetTopSlot's `up`,
 * the Drawer's own end of its slide) and only if the card, or the map's
 * buttons over it, hide the spot tapped, the map eases it to the middle of
 * the room the card leaves, once. Not where the pilot has moved the map
 * since (pilotCamera), nor while the map flies to a place picked (an
 * airport's card flies to the field itself). Returns the tap's note, for
 * what the map's own tap hears (a feature drawn on the canvas).
 */
export function useTappedInSight(
  map: maplibregl.Map | null,
  insets: RefObject<MapInsets>,
  padOf: (insets: MapInsets) => Required<PaddingOptions>,
  flying: RefObject<unknown>,
) {
  const tapped = useRef<{ at: LngLatLike; when: number } | null>(null);
  const note = useCallback((at: LngLatLike) => {
    // A tap is a pick: the map is the app's to move again (pilotCamera).
    picked();
    tapped.current = { at, when: performance.now() };
  }, []);
  // A mark drawn as an element over the chart (a checkpoint's numbered
  // dot), tapped: its own click, which the map's tap (GlMapShell) does not
  // hear, noted where it is drawn.
  useEffect(() => {
    if (!map) return;
    const box = map.getContainer();
    const click = (event: MouseEvent) => {
      const mark = event.target instanceof Element ? event.target.closest(".maplibregl-marker") : null;
      if (!mark) return;
      const r = mark.getBoundingClientRect(),
        at = box.getBoundingClientRect();
      note(map.unproject([r.left + r.width / 2 - at.left, r.top + r.height / 2 - at.top]));
    };
    box.addEventListener("click", click, true);
    return () => box.removeEventListener("click", click, true);
  }, [map, note]);
  useEffect(() => {
    if (!map) return;
    return useSheetTop.subscribe((now, was) => {
      // A card has come up: one more of them settled.
      if (now.up.length <= was.up.length) return;
      const tap = tapped.current;
      tapped.current = null;
      if (!tap || performance.now() - tap.when > TAP_WAITS_MS || pilotMoved() || flying.current) return;
      const pad = padOf(insets.current);
      if (!inRoom(map, tap.at, pad)) map.easeTo({ center: tap.at, padding: pad, duration: DRAWER_MS, easing: drawerEasing });
    });
  }, [map, insets, padOf, flying]);
  useFloatingInSight(map, insets, padOf, tapped);
  return note;
}

/**
 * What a floating card is about -- the spot tapped as it opened: a
 * checkpoint, a leg, traffic, a TFR -- kept beside it rather than under it,
 * as Apple Maps keeps a place clear of its card. Each time a floating card
 * comes, goes or changes size (floatRoom), the map's padding is set to the
 * room the cards leave (padOf), the chart kept where it is (keepStill);
 * and only if that spot is now hidden, the map eases it to the middle of
 * that room. Not where the pilot has moved the map since (pilotCamera),
 * nor over a move of the pilot's or another of the app's under way. Under
 * Reduce Motion MapLibre goes straight there itself (lib/motion).
 */
function useFloatingInSight(
  map: maplibregl.Map | null,
  insets: RefObject<MapInsets>,
  padOf: (insets: MapInsets) => Required<PaddingOptions>,
  tapped: RefObject<{ at: LngLatLike; when: number } | null>,
) {
  useEffect(() => {
    if (!map) return;
    // The spot the cards open are about, and whether the map is easing to it.
    let subject: LngLatLike | null = null;
    let aimed = false;
    const rested = () =>
      queueMicrotask(() => {
        if (!map.isMoving()) aimed = false;
      });
    map.on("moveend", rested);
    const stop = useFloatRoom.subscribe((now, was) => {
      const open = Object.keys(now.boxes);
      if (open.length === 0) subject = null;
      else if (open.some((id) => !(id in was.boxes))) {
        // A card come up for a tap: the spot tapped is what it is about. One
        // opened from a button over it (the Map card) keeps the one under's.
        const tap = tapped.current;
        if (tap && performance.now() - tap.when <= TAP_WAITS_MS) {
          tapped.current = null;
          subject = tap.at;
        }
      }
      if (map.isMoving() && !aimed) return;
      const pad = padOf(insets.current);
      if (subject && !pilotMoved() && !inRoom(map, subject, pad)) {
        aimed = true;
        map.easeTo({ center: subject, padding: pad, duration: DRAWER_MS, easing: drawerEasing });
        return;
      }
      const had = map.getPadding();
      if (had.top !== pad.top || had.bottom !== pad.bottom || had.left !== pad.left || had.right !== pad.right) keepStill(map, pad);
    });
    return () => {
      stop();
      map.off("moveend", rested);
    };
  }, [map, insets, padOf, tapped]);
}
