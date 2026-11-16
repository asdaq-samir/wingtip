import type { LngLatLike, Map as GlMap, PaddingOptions } from "maplibre-gl";
import { FIT_MARGIN } from "../clear";
import { useOwnShip } from "../position/ownShip";
import { useTracking } from "../position/tracking";
import { linear, type Follow, type Intent } from "./cameraRules";

/* The camera owner's (camera.ts) shapes and small helpers: what a move
 * aims at, the room a card leaves, and the test log. */
export type Pad = Required<PaddingOptions>;
/** A point as MapLibre takes one: longitude, latitude. */
export type Point = [number, number];
export type Bounds = [Point, Point];
export type Margin = { top: number; bottom: number; left: number; right: number };

/** Where the move under way is going, for the sheet turning under it to
 *  aim it again rather than stop it. */
export type Aim = { center: Point; zoom: number; how: "ease" | "fly"; pad: Pad } | { bounds: Bounds; margin: Margin; maxZoom?: number };

export interface PickOptions {
  /** In MapLibre's levels; the zoom now when left out. */
  zoom?: number;
  duration?: number;
  easing?: (t: number) => number;
  /** Moved only if the point is out of the room `pad` leaves, clear of
   *  `margin`: a mark tapped is in sight already unless a card hides it. */
  onlyIfHidden?: boolean;
  pad?: Pad;
  margin?: Margin;
  /** The follow this pick starts, kept on (the location arrow's flight in
   *  to own ship, the flight to an airplane tracked); every other follow
   *  ends, as Apple Maps' tracking ends at a place picked. */
  keeps?: Follow;
}

/** The room's way of changing (GlMapShell's follow of the sheet): the
 *  chart kept still under a card, the padding set, or eased with the sheet. */
export type RoomHow = "still" | "set" | "ease";

/** Where a follow keeps its point: the middle of the room, or where it is. */
export type Keep = "middle" | "place";

/** Whether a test drives this browser, as useGlProbe asks. */
const testDriven = () => typeof navigator !== "undefined" && navigator.webdriver === true;

/** Each move the owner makes, for the browser tests to count
 *  (`window.__wingtipCamera`): when, for what, and how. A pilot's phone
 *  keeps none. */
export function log(intent: Intent | "room", call: string, options: { duration?: number; easing?: unknown } = {}) {
  if (!testDriven()) return;
  const w = window as unknown as { __wingtipCamera?: unknown[] };
  (w.__wingtipCamera ??= []).push({
    t: performance.now(),
    intent,
    call,
    duration: options.duration ?? null,
    linear: options.easing === linear,
  });
}

/** Every follow but `keeps` turned off: the pilot's switches, which the
 *  location arrow and an airplane's card turn on again. */
export function endFollows(keeps?: Follow) {
  const ownShip = useOwnShip.getState();
  if (keeps !== "own-ship" && keeps !== "dry-run" && ownShip.enabled && ownShip.follow) ownShip.setFollow(false);
  if (keeps !== "track" && useTracking.getState().follow) useTracking.setState({ follow: false });
}

/** The map's padding now, as MapLibre keeps it. */
export function padOf(map: GlMap): Pad {
  const { top = 0, bottom = 0, left = 0, right = 0 } = map.getPadding();
  return { top, bottom, left, right };
}

/**
 * The map's room changed for a card coming or going, the view kept still:
 * MapLibre's padding set to the room now left, with the centre moved to
 * what is at the middle of that room already, so nothing on the chart
 * moves. Easing the padding as the sheet's own size does slid the chart
 * under the pilot's finger at every card (the owner's iPhone, 2026-11-12:
 * "Why are all the cards jumping like this?").
 */
export function keepStill(map: GlMap, pad: Pad) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const middle = map.unproject([pad.left + (width - pad.left - pad.right) / 2, pad.top + (height - pad.top - pad.bottom) / 2]);
  log("room", "jumpTo");
  map.jumpTo({ center: middle, padding: pad });
}

/** Whether `at` is in the room `pad` leaves the chart, clear of the map's
 *  buttons along its edges (FIT_MARGIN, or `margin`). */
export function inRoom(map: GlMap, at: LngLatLike, pad: Pad, margin: Margin = FIT_MARGIN): boolean {
  return onScreenInRoom(map, map.project(at), pad, margin);
}

export function onScreenInRoom(map: GlMap, p: { x: number; y: number }, pad: Pad, margin: Margin = FIT_MARGIN): boolean {
  const { width, height } = map.getContainer().getBoundingClientRect();
  return (
    p.x >= pad.left + margin.left &&
    p.x <= width - pad.right - margin.right &&
    p.y >= pad.top + margin.top &&
    p.y <= height - pad.bottom - margin.bottom
  );
}
