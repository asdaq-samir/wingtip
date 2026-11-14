import type * as maplibregl from "maplibre-gl";
import type { LngLatLike, PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { MapInsets } from "../../lib/mapChrome";
import { FIT_MARGIN } from "../../lib/map/clear";
import { picked, pilotMoved } from "../../lib/map/gl/pilotCamera";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { useSheetTop } from "../sheet/sheetTopSlot";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";

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
    // A tap is a pick: the map is the app's to move again (pilotCamera),
    // and own ship stops pulling it back, as a place flown to stops it
    // (GlMapShell's flyTo) and as Apple Maps' tracking ends at a place
    // picked. Left following, the GPS's next fix (one a second on a phone)
    // eased the map back to own ship just after this brought the tap into
    // sight (the owner's iPhone, 2026-11-14: "When I tap the EON ... It
    // flickers").
    picked();
    const ownShip = useOwnShip.getState();
    if (ownShip.enabled && ownShip.follow) ownShip.setFollow(false);
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
  return note;
}
