import type { GeoJSONSource, GeoJSONSourceDiff, Map as MlMap } from "maplibre-gl";

/** What each traffic source was last sent, each feature's JSON by its
 *  airplane's hex: by the source itself, so one made again (a new style)
 *  is sent afresh, whole. */
const lastSent = new WeakMap<GeoJSONSource, Sent>();

/** Each feature's place (with what moves with it) and look as JSON, by hex. */
type Sent = Map<string, { place: string; look: string }>;

/**
 * A frame of the traffic sent to the map's worker: only the airplanes that
 * moved, came or went (GeoJSON's updateData, the source keyed by hex with
 * promoteId), where every frame sent the whole collection and the worker
 * indexed it again from nothing -- ten a second while an airplane is
 * followed (the round-2 speed audit). A frame with nothing changed (none
 * in sight, or every one on the ground and still) sends nothing. The first
 * frame to a source is sent whole. The properties named in `moving` change
 * with the place (3D's height, alt_m) and are sent with it, as a property
 * updated in place, never as a new look that takes the airplane out and
 * puts it back whole.
 */
export function sendTraffic<P extends { hex: string }>(
  map: MlMap,
  id: string,
  features: GeoJSON.Feature<GeoJSON.Geometry, P>[],
  moving: readonly (keyof P & string)[] = [],
) {
  const source = map.getSource<GeoJSONSource>(id);
  if (!source) return;
  // One feature an id: a hex heard twice in an answer is drawn once.
  features = features.filter((f, i) => features.findIndex((g) => g.properties.hex === f.properties.hex) === i);
  const next: Sent = new Map(features.map((f) => [f.properties.hex, sentOf(f, moving)]));
  const was = lastSent.get(source);
  lastSent.set(source, next);
  if (!was) {
    source.setData({ type: "FeatureCollection", features });
    return;
  }
  const diff = trafficDiff(was, next, features, moving);
  if (diff) void source.updateData(diff);
}

/** A feature's place, with its `moving` properties, and the rest, its look. */
function sentOf<P extends { hex: string }>(f: GeoJSON.Feature<GeoJSON.Geometry, P>, moving: readonly string[]) {
  const look: Record<string, unknown> = { ...f.properties };
  for (const key of moving) delete look[key];
  const place = moving.length ? [f.geometry, ...moving.map((key) => f.properties[key as keyof P])] : f.geometry;
  return { place: JSON.stringify(place), look: JSON.stringify(look) };
}

/** What changed between two frames, null for nothing: an airplane only
 *  moved has its new place alone, and its moving properties; one whose
 *  look changed too is taken out and put back whole. */
function trafficDiff<P extends { hex: string }>(
  was: Sent,
  next: Sent,
  features: GeoJSON.Feature<GeoJSON.Geometry, P>[],
  moving: readonly (keyof P & string)[],
): GeoJSONSourceDiff | null {
  const remove = [...was.keys()].filter((hex) => !next.has(hex));
  const add: GeoJSON.Feature<GeoJSON.Geometry, P>[] = [];
  const update: NonNullable<GeoJSONSourceDiff["update"]> = [];
  for (const f of features) {
    const hex = f.properties.hex;
    const before = was.get(hex);
    const now = next.get(hex)!;
    if (before === undefined) add.push(f);
    else if (before.look !== now.look) {
      remove.push(hex);
      add.push(f);
    } else if (before.place !== now.place) {
      const props = moving.map((key) => ({ key, value: f.properties[key] }));
      update.push(props.length ? { id: hex, newGeometry: f.geometry, addOrUpdateProperties: props } : { id: hex, newGeometry: f.geometry });
    }
  }
  if (!remove.length && !add.length && !update.length) return null;
  return { remove, add, update };
}

/** How often a frame of the traffic is drawn, ms, at the app's `zoom`
 *  (TrafficGl's header has why): once a second at the chart's scales,
 *  where an airplane at 120 kt moves a pixel or two in it, up to four a
 *  second zoomed in close; an airplane followed ten a second close in, as
 *  the camera's follow eases linearly between frames. The flat map's and
 *  the 3D view's (TrafficAloftGl) alike. */
export function trafficFrameMs(zoom: number, following: boolean): number {
  return following
    ? Math.min(1000, FOLLOW_FRAME_MS * 2 ** Math.max(0, 10 - Math.round(zoom)))
    : Math.min(1000, FRAME_MS * 2 ** Math.max(0, 12 - Math.round(zoom)));
}
const FOLLOW_FRAME_MS = 100;
const FRAME_MS = 250;
