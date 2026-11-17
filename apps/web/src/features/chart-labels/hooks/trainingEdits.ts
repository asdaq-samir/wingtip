import type { Course, Detection, Endpoint, LoosePick, PickSaved, Point, Rating, Role, StreamMessage } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { pointKey } from "../logic";

/** What a rating, a category change or a removal changes about a
 *  point: the fields the server's pick holds, kept by the point's own
 *  place. */
export interface Edit {
  rating: Rating | null;
  rated: boolean;
  role: Role | null;
  category: string;
}

/** Enough to put a point back: its fields before the action, and for
 *  an added point that was removed, the point itself. */
interface UndoEntry {
  key: string;
  kind: "detected" | "added";
  before: Edit;
  reinsert?: LoosePick;
}

export interface Edits {
  route: string;
  overrides: Record<string, Edit>;
  /** Points added by hand this session, never taken out of this list
   *  -- a removal marks them in `removed`, so an undo is one key. */
  added: LoosePick[];
  removed: string[];
  undo: UndoEntry | null;
  /** The selected point, by its place (`pointKey`) -- how everything
   *  else here already names a point: the overrides, the removals, the
   *  undo entry, and the server's own same_place. It used to be a
   *  position in the list of added points, and that list gets the picks
   *  no detection claimed put in front of it when the chart read ends:
   *  a point added mid-read then pointed at one of those, and the next
   *  digit key rated the wrong pick. */
  selection: string | null;
}

export const editOf = (p: Detection | LoosePick): Edit => ({ rating: p.rating, rated: p.rated, role: p.role, category: p.category });
/** Picks on other points nearby that a save took the place of (the
 *  planner keeps one per place, whatever each point is): shown unrated
 *  again, as the planner now holds them, and said out loud -- it used to
 *  happen silently, with the other point still showing its rating. */
export const withoutDisplaced = (e: Edits, saved: PickSaved, points: Map<string, { point: Point }>): Edits => {
  if (saved.displaced.length === 0) return e;
  const overrides = { ...e.overrides };
  for (const d of saved.displaced) {
    const key = pointKey(d);
    const was = points.get(key)?.point as Detection | LoosePick | undefined;
    if (was) overrides[key] = { ...editOf(was), ...overrides[key], rating: null, rated: false };
  }
  const what = saved.displaced.map((d) => d.category.replace(/_/g, " ")).join(", ");
  done("Nearby Pick Replaced", { detail: `The ${what} beside it: one pick per place` });
  return { ...e, overrides };
};

/** A point added by hand, placed along the route by the planner once
 *  saved: until then it has no distances of its own, and it used to
 *  stay at 0 nm -- first in the flight-order walk -- for the session. */
export const placed = (e: Edits, key: string, pick: LoosePick): Edits => ({
  ...e,
  added: e.added.map((p) => (pointKey(p) === key ? { ...p, along_track_nm: pick.along_track_nm, cross_track_nm: pick.cross_track_nm } : p)),
});
export const fresh = (route: string): Edits => ({ route, overrides: {}, added: [], removed: [], undo: null, selection: null });

/** The ends of the leg, from the course alone. */
export function endpointsOf(c: Course | undefined): Endpoint[] {
  if (!c) return [];
  return [
    {
      endpoint: true,
      ident: c.departure.ident,
      name: c.departure.name,
      lat: c.departure.lat,
      lon: c.departure.lon,
      along_track_nm: 0,
      category: "departure",
    },
    {
      endpoint: true,
      ident: c.destination.ident,
      name: c.destination.name,
      lat: c.destination.lat,
      lon: c.destination.lon,
      along_track_nm: c.distance_nm,
      category: "destination",
    },
  ];
}

/**
 * The chart read's points so far, from the messages streamed in.
 * One point per place, as the planner keeps one pick per place: where
 * two features share a centroid (a road over a river), the first read
 * stands for it, and its category can be changed. Both used to be
 * listed under the one key, so selecting either selected the later,
 * the keys could not walk past them, and their markers shared a key.
 */
export function streamedPoints(messages: StreamMessage[]) {
  const seen = new Set<string>();
  const detections = messages
    .flatMap((m) => (m.type === "block" ? m.detections : []))
    .filter((d) => {
      const key = pointKey(d);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Picks no detection claimed arrive last: a later block might still
  // have claimed one, so they cannot be known any earlier.
  const added = messages.flatMap((m) => (m.type === "done" ? m.added : []));
  return { detections, added };
}
