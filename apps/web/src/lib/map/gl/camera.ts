import type { EaseToOptions, Map as GlMap } from "maplibre-gl";
import { picked, watchPilotMoves } from "./pilotCamera";
import { followMs, linear, pickHow, verdict, FOLLOW_LEAST_PX, type Follow, type Intent } from "./cameraRules";
import {
  endFollows,
  inRoom,
  keepStill,
  log,
  onScreenInRoom,
  padOf,
  type Aim,
  type Bounds,
  type Keep,
  type Margin,
  type Pad,
  type PickOptions,
  type Point,
  type RoomHow,
} from "./cameraParts";
/**
 * The one owner of a map's camera (the flicker audit's cause D, 2026-11-14).
 * Every mover asks it with an intent -- a pick brought into sight, a fit, a
 * follow of own ship, an airplane, the dry run or a replay, the sheet's
 * room -- and it decides which wins (cameraRules' verdict: the pilot's
 * hand, then a pick or a fit, then a follow), makes one MapLibre move for
 * it, and turns the sheet turning under a move into that move aimed again,
 * never a second one. A drag ends every follow, as Apple Maps' tracking
 * ends; a pick ends every follow but the one it starts.
 */
class Camera {
  /** The move the owner last made, and what it was for. */
  private running: { intent: Intent; aim: Aim | null } | null = null;
  /** A follow's latest point, moved to at the next frame: a pick or a fit
   *  asked in the same frame (a route's first fit with own ship's first
   *  fix, FL-22) takes the camera instead. */
  private pending: { intent: Follow; at: Point; edge: number | null; keep: Keep } | null = null;
  /** Each follow's point the map last went with, for a follow that keeps
   *  its point where it is on the screen. */
  private applied = new Map<Follow, Point>();
  /** Where the follow under way is taking the map's middle. */
  private followAim: Point | null = null;
  private frame = 0;
  /** When each follow last asked, for its ease to last till the next. */
  private asked = new Map<Follow, number>();
  /** How long the next follow's ease runs, from that interval. */
  private nextMs = new Map<Follow, number>();
  /** The sheet's room, taken once the pick under way has landed (room). */
  private later: Pad | null = null;

  constructor(private readonly map: GlMap) {
    watchPilotMoves(map);
    map.on("movestart", (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) this.running = { intent: "hand", aim: null };
    });
    // Only a drag ends a follow: a pinch keeps own ship in the middle, as
    // Apple Maps' tracking does.
    map.on("dragstart", (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) endFollows();
    });
    // Let go once at rest. Not at the moveend a move aimed again fires:
    // MapLibre stops the old one and starts the new in the same call, so
    // the map is moving again by the next microtask.
    map.on("moveend", () =>
      queueMicrotask(() => {
        if (map.isMoving()) return;
        this.running = null;
        const later = this.later;
        this.later = null;
        if (later) keepStill(map, later);
      }),
    );
  }

  /** What has the camera: the intent of the move under way, null at rest. */
  holder(): Intent | null {
    return this.running && this.map.isMoving() ? this.running.intent : null;
  }

  /** Whether a pick or a fit is under way. */
  picking(): boolean {
    const h = this.holder();
    return h === "pick" || h === "fit";
  }

  /** A tap on the chart: the map is the app's to move again, and every
   *  follow ends (the owner's iPhone, 2026-11-14: own ship's next fix eased
   *  EON back under the card it had just been brought over). */
  tapped() {
    picked();
    endFollows();
  }

  /** `at` brought into sight: eased within a few screens, flown beyond
   *  (pickHow); with `onlyIfHidden`, moved only if out of the room. False
   *  where nothing moved. */
  pick(at: Point, o: PickOptions = {}): boolean {
    const map = this.map;
    if (o.onlyIfHidden && inRoom(map, at, o.pad ?? padOf(map), o.margin)) return false;
    const zoom = o.zoom ?? map.getZoom();
    const aim = this.running?.aim;
    // The same pick asked again while it moves: one move for it.
    if (this.holder() === "pick" && aim && "center" in aim && aim.center[0] === at[0] && aim.center[1] === at[1] && aim.zoom === zoom)
      return false;
    picked();
    endFollows(o.keeps);
    const { width, height } = map.getContainer().getBoundingClientRect();
    const there = map.project(at),
      middle = map.project(map.getCenter());
    const how = o.onlyIfHidden
      ? "ease"
      : pickHow(Math.hypot(there.x - middle.x, there.y - middle.y), Math.max(width, height), zoom - map.getZoom());
    this.running = { intent: "pick", aim: { center: at, zoom, how, pad: o.pad ?? padOf(map) } };
    const options: EaseToOptions & { center: Point; zoom: number } = { center: at, zoom };
    if (o.duration !== undefined) options.duration = o.duration;
    if (o.pad) options.padding = o.pad;
    if (how === "ease") {
      if (o.easing) options.easing = o.easing;
      log("pick", "easeTo", options);
      map.easeTo(options);
    } else {
      log("pick", "flyTo", options);
      // A gentler arc than MapLibre's default (1.42): less of the zoom out
      // and back in on the way (FL-18).
      map.flyTo({ ...options, curve: 1 });
    }
    return true;
  }

  /** `bounds` fitted clear of `margin` over the map's padding (the room
   *  the sheet leaves). A single point is brought into sight only if out
   *  of the room, not fitted (FL-20: a fit to a box of no size). */
  fit(bounds: Bounds, o: { margin: Margin; maxZoom?: number; duration: number }) {
    const [[west, south], [east, north]] = bounds;
    if (west === east && south === north) {
      this.pick([west, south], { onlyIfHidden: true, margin: o.margin, duration: o.duration });
      return;
    }
    picked();
    endFollows();
    this.running = { intent: "fit", aim: { bounds, margin: o.margin, ...(o.maxZoom !== undefined ? { maxZoom: o.maxZoom } : {}) } };
    log("fit", "fitBounds", o);
    this.map.fitBounds(bounds, { padding: o.margin, duration: o.duration, ...(o.maxZoom !== undefined ? { maxZoom: o.maxZoom } : {}) });
  }

  /**
   * The next point of a follow, kept in the middle: one linear ease a
   * point, lasting till the next is due, so each continues the last at
   * the same pace (FL-13); not while a pick, a fit or the pilot's hand has
   * the camera (FL-7), and not for a point less than a pixel from the
   * middle. With `edge`, only once the point is within that share of the
   * screen's edge, and then put in the middle at once (a replay). With
   * `keep: "place"`, the point is kept where it is on the screen rather
   * than drawn to the middle (an airplane tracked: tapped on the chart it
   * is in sight already, and drawing it to the middle of the room as a
   * card came up was a second move back the other way, FL-7).
   */
  follow(intent: Follow, at: Point, { edge = null, keep = "middle" }: { edge?: number | null; keep?: Keep } = {}) {
    const now = performance.now();
    const last = this.asked.get(intent);
    this.asked.set(intent, now);
    this.nextMs.set(intent, followMs(last === undefined ? null : now - last));
    this.pending = { intent, at, edge, keep };
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flush());
  }

  private flush() {
    this.frame = 0;
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const map = this.map;
    const from = this.applied.get(p.intent);
    if (verdict(this.holder(), p.intent) !== "go") {
      // What the point did meanwhile is let go: the move under way decides.
      this.applied.set(p.intent, p.at);
      return;
    }
    if (p.keep === "place") {
      this.applied.set(p.intent, p.at);
      if (!from) return;
      const base = this.holder() === p.intent && this.followAim ? this.followAim : map.getCenter().toArray();
      const to: Point = [base[0] + p.at[0] - from[0], base[1] + p.at[1] - from[1]];
      const a = map.project(base),
        b = map.project(to);
      if (Math.hypot(a.x - b.x, a.y - b.y) < FOLLOW_LEAST_PX) {
        // Not yet a pixel: kept to add to the next step.
        this.applied.set(p.intent, from);
        return;
      }
      this.ease(p.intent, to);
      return;
    }
    const there = map.project(p.at);
    if (p.edge !== null) {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const e = p.edge;
      if (there.x >= w * e && there.x <= w * (1 - e) && there.y >= h * e && there.y <= h * (1 - e)) return;
      this.running = { intent: p.intent, aim: null };
      log(p.intent, "jumpTo");
      map.jumpTo({ center: p.at });
      return;
    }
    const middle = map.project(map.getCenter());
    if (Math.hypot(there.x - middle.x, there.y - middle.y) < FOLLOW_LEAST_PX) return;
    this.ease(p.intent, p.at);
  }

  /** A follow's one linear ease to `center`, lasting till its next point. */
  private ease(intent: Follow, center: Point) {
    const options = { center, duration: this.nextMs.get(intent) ?? followMs(null), easing: linear };
    this.running = { intent, aim: null };
    this.followAim = center;
    log(intent, "easeTo", options);
    this.map.easeTo(options);
  }

  /**
   * The room the sheet leaves changed to `pad`. A pick under way that will
   * land in sight in the new room is left to land, and the room taken
   * then with the chart kept still: aimed again, it was a second move for
   * one pick (the flicker audit's FL-8, a card's room arriving as the map
   * flew to its field). One that would land hidden, and a fit, are aimed
   * again at it, in the sheet's time (a second move would stop MapLibre's
   * first where it is, the course left half fitted). Otherwise the padding
   * is taken as `how` says.
   */
  room(pad: Pad, how: RoomHow, ease: { duration: number; easing: (t: number) => number }) {
    const map = this.map;
    this.later = null;
    const aim = this.picking() ? this.running?.aim : null;
    if (aim && "center" in aim) {
      // Where it lands: the middle of the room it was aimed at.
      const { width, height } = map.getContainer().getBoundingClientRect();
      const lands = {
        x: aim.pad.left + (width - aim.pad.left - aim.pad.right) / 2,
        y: aim.pad.top + (height - aim.pad.top - aim.pad.bottom) / 2,
      };
      if (onScreenInRoom(map, lands, pad)) {
        this.later = pad;
        return;
      }
      aim.pad = pad;
      const options = { center: aim.center, zoom: aim.zoom, padding: pad, duration: ease.duration };
      log("pick", aim.how === "fly" ? "flyTo" : "easeTo", options);
      if (aim.how === "fly") map.flyTo(options);
      else map.easeTo({ ...options, easing: ease.easing });
      return;
    }
    if (aim && "bounds" in aim) {
      // Asked with the margin over the new room (absolutePadding), not over
      // the padding the map is part way through.
      const { margin } = aim;
      const camera = map.cameraForBounds(aim.bounds, {
        padding: {
          top: pad.top + margin.top,
          bottom: pad.bottom + margin.bottom,
          left: pad.left + margin.left,
          right: pad.right + margin.right,
        },
        absolutePadding: true,
        ...(aim.maxZoom !== undefined ? { maxZoom: aim.maxZoom } : {}),
      });
      if (camera) {
        const options = {
          center: camera.center,
          zoom: camera.zoom ?? map.getZoom(),
          padding: pad,
          duration: ease.duration,
          easing: ease.easing,
        };
        log("fit", "easeTo", options);
        map.easeTo(options);
        return;
      }
    }
    if (how === "still") keepStill(map, pad);
    else if (how === "set") {
      log("room", "setPadding");
      map.setPadding(pad);
    } else {
      log("room", "easeTo", ease);
      map.easeTo({ padding: pad, ...ease });
    }
  }
}

const owners = new WeakMap<GlMap, Camera>();

/** The camera's owner for `map`, made with the map (GlMapShell) so it hears
 *  the pilot's first drag. */
export function cameraOf(m: GlMap): Camera {
  let owner = owners.get(m);
  if (!owner) owners.set(m, (owner = new Camera(m)));
  return owner;
}
