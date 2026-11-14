import type * as maplibregl from "maplibre-gl";
import type { PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { MapInsets } from "../../lib/mapChrome";
import { cameraOf } from "../../lib/map/gl/camera";
import { pilotMoved } from "../../lib/map/gl/pilotCamera";
import { useSheetTop } from "../sheet/sheetTopSlot";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";

/** How long a tap waits for the card it opens to come up, ms: past it the
 *  tap is old news and a card that comes up later moves nothing. */
const TAP_WAITS_MS = 3000;

/**
 * What a tap on the chart opened a card for, kept in sight as Apple Maps
 * keeps a place it opens: once the card has come up (sheetTopSlot's `up`,
 * the Drawer's own end of its slide) and only if the card, or the map's
 * buttons over it, hide the spot tapped, the map eases it to the middle of
 * the room the card leaves, once, through the camera's owner
 * (lib/map/gl/camera). Not where the pilot has moved the map since
 * (pilotCamera), nor while the map flies to a place picked elsewhere.
 * Returns the tap's note, for what the map's own tap hears (a feature
 * drawn on the canvas), and whether a tap is waiting on its card
 * (`fresh`): an airport tapped on the chart is never flown to (FL-8).
 */
export function useTappedInSight(
  map: maplibregl.Map | null,
  insets: RefObject<MapInsets>,
  padOf: (insets: MapInsets) => Required<PaddingOptions>,
) {
  const tapped = useRef<{ at: [number, number]; when: number } | null>(null);
  const note = useCallback(
    (at: [number, number]) => {
      // A tap is a pick: the map is the app's to move again, and every
      // follow stops pulling it back (camera's tapped). Left following, the
      // GPS's next fix (one a second on a phone) eased the map back to own
      // ship just after this brought the tap into sight (the owner's
      // iPhone, 2026-11-14: "When I tap the EON ... It flickers").
      if (map) cameraOf(map).tapped();
      tapped.current = { at, when: performance.now() };
    },
    [map],
  );
  const fresh = useCallback(() => {
    const tap = tapped.current;
    return !!tap && performance.now() - tap.when <= TAP_WAITS_MS;
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
      note(map.unproject([r.left + r.width / 2 - at.left, r.top + r.height / 2 - at.top]).toArray());
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
      const camera = cameraOf(map);
      if (!tap || performance.now() - tap.when > TAP_WAITS_MS || pilotMoved() || camera.picking()) return;
      camera.pick(tap.at, { onlyIfHidden: true, pad: padOf(insets.current), duration: DRAWER_MS, easing: drawerEasing });
    });
  }, [map, insets, padOf]);
  return { note, fresh };
}
