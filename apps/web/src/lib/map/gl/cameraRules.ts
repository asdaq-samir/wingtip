/**
 * The camera owner's rules (camera.ts), apart from any map so a unit test
 * can hold them: which intent wins the camera, how long a follow's ease
 * runs, and how a pick travels. The flicker audit of 2026-11-14 (cause D)
 * found eight movers each calling the camera with only partial checks of
 * the others, so a follow cut a flight short (FL-7), a route's fit was
 * overridden 2 ms after own ship's ease (FL-22) and the dry run restarted
 * its ease at every fix (FL-13).
 */

/** What a move is for. The pilot's own hand is heard, never asked. */
export type Intent = "hand" | "pick" | "fit" | Follow;

/** A stream of points the map keeps in its middle: own ship, an airplane
 *  tracked, the dry run's airplane, a past flight replayed. */
export type Follow = "own-ship" | "track" | "dry-run" | "replay";

const FOLLOWS: readonly Intent[] = ["own-ship", "track", "dry-run", "replay"];

const isFollow = (intent: Intent): intent is Follow => FOLLOWS.includes(intent);

/** Higher beats lower: the pilot's hand beats all, as Apple Maps leaves a
 *  map the pilot has in hand; a pick (a place, a result, a route made)
 *  beats a follow, as Apple Maps' tracking ends at a place picked. */
function rank(intent: Intent): number {
  if (intent === "hand") return 3;
  if (intent === "pick" || intent === "fit") return 2;
  return 1;
}

/**
 * What the owner does with `ask` while `running` has the camera (null:
 * at rest): "go" moves the map; "wait" lets this step of a follow go by,
 * its next step (a fix or a frame on) moving the map once the higher move
 * has landed or the pilot's fingers are off it (FL-7: the follow's jump
 * stopped the flight to the airplane 124 ms in). A pick or a fit always
 * goes: it is the pilot's own choice, made now. Whether a follow is on at
 * all is the pilot's switch, which a drag or a tap turns off (camera.ts).
 */
export function verdict(running: Intent | null, ask: Intent): "go" | "wait" {
  if (!isFollow(ask)) return "go";
  return running && rank(running) > rank(ask) ? "wait" : "go";
}

/** A follow's first ease, before there is an interval to match, ms. */
const FOLLOW_FIRST_MS = 500;
/** The shortest and longest a follow's ease runs, ms: a frame-rate stream
 *  is not eased shorter than this, and a GPS gone quiet for a while is not
 *  crept towards over many seconds. */
const FOLLOW_MIN_MS = 100;
const FOLLOW_MAX_MS = 1500;

/**
 * How long a follow's ease runs: the time since its last point, so each
 * ease lands as the next point comes and the next continues it at the
 * same pace (FL-13: a 500 ms ease-in-out at every 250 ms dry-run fix
 * slowed and sped the map up again at each one).
 */
export function followMs(sinceLastMs: number | null): number {
  // A stream begun again after a pause starts afresh.
  if (sinceLastMs === null || sinceLastMs > 2 * FOLLOW_MAX_MS) return FOLLOW_FIRST_MS;
  return Math.min(FOLLOW_MAX_MS, Math.max(FOLLOW_MIN_MS, Math.round(sinceLastMs)));
}

/** A follow's ease is linear: a stream of points is a steady pace, not a
 *  start and a stop at each one. */
export const linear = (t: number) => t;

/** How many screens away a pick is still eased to, not flown. */
const EASE_SCREENS = 3;

/**
 * How a pick travels: eased, as Apple Maps moves to a place, when it is
 * within a few screens and the zoom changes by little; flown on MapLibre's
 * arc only beyond (FL-18: an airport picked from the search zoomed out
 * 7 → 6.4 and back in to 8 on a flyTo's default arc).
 */
export function pickHow(distancePx: number, screenPx: number, zoomChange: number): "ease" | "fly" {
  return distancePx <= EASE_SCREENS * screenPx && Math.abs(zoomChange) <= 3 ? "ease" : "fly";
}

/** The least a follow moves the map, px: a point that has drifted less
 *  than this from the middle is left (a GPS standing still, an airplane
 *  far out at a slow pace), so a follow moves the map only when it shows. */
export const FOLLOW_LEAST_PX = 1;
