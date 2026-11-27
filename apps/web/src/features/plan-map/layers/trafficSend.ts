import type { GeoJSONSource, GeoJSONSourceDiff, Map as MlMap } from "maplibre-gl";

/** What each traffic source was last sent, each feature's JSON by its
 *  airplane's hex: by the source itself, so one made again (a new style)
 *  is sent afresh, whole. */
const lastSent = new WeakMap<GeoJSONSource, Sent>();

/** Each feature's place and look as JSON, by hex. */
type Sent = Map<string, { place: string; look: string }>;

/** A traffic feature: its airplane's hex its id (the source's promoteId). */
type HexFeature = GeoJSON.Feature<GeoJSON.Geometry, { hex: string }>;

/**
 * A frame of the traffic sent to the map's worker: only the airplanes that
 * moved, came or went (GeoJSON's updateData, the source keyed by hex with
 * promoteId), where every frame sent the whole collection and the worker
 * indexed it again from nothing -- ten a second while an airplane is
 * followed (the round-2 speed audit). A frame with nothing changed (none
 * in sight, or every one on the ground and still) sends nothing. The first
 * frame to a source is sent whole.
 */
export function sendTraffic(map: MlMap, id: string, features: HexFeature[]) {
  const source = map.getSource<GeoJSONSource>(id);
  if (!source) return;
  // One feature an id: a hex heard twice in an answer is drawn once.
  features = features.filter((f, i) => features.findIndex((g) => g.properties.hex === f.properties.hex) === i);
  const next: Sent = new Map(
    features.map((f) => [f.properties.hex, { place: JSON.stringify(f.geometry), look: JSON.stringify(f.properties) }]),
  );
  const was = lastSent.get(source);
  lastSent.set(source, next);
  if (!was) {
    source.setData({ type: "FeatureCollection", features });
    return;
  }
  const diff = trafficDiff(was, next, features);
  if (diff) void source.updateData(diff);
}

/** What changed between two frames, null for nothing: an airplane only
 *  moved has its new place alone; one whose look changed too is taken
 *  out and put back whole. */
function trafficDiff(was: Sent, next: Sent, features: HexFeature[]): GeoJSONSourceDiff | null {
  const remove = [...was.keys()].filter((hex) => !next.has(hex));
  const add: HexFeature[] = [];
  const update: NonNullable<GeoJSONSourceDiff["update"]> = [];
  for (const f of features) {
    const hex = f.properties.hex;
    const before = was.get(hex);
    const now = next.get(hex)!;
    if (before === undefined) add.push(f);
    else if (before.look !== now.look) {
      remove.push(hex);
      add.push(f);
    } else if (before.place !== now.place) update.push({ id: hex, newGeometry: f.geometry });
  }
  if (!remove.length && !add.length && !update.length) return null;
  return { remove, add, update };
}
