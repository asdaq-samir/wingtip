import type { Map as GlMap, Marker } from "maplibre-gl";

/**
 * The route's own marks give way to each other by priority, as MapLibre's
 * symbols do among themselves and as the iPhone's map gives way (its
 * marks by priority): the destination's ident over every other, the
 * route's other fields next, then the numbered checkpoints in flight
 * order, then the tops of climb and descent. They are HTML markers
 * (useGlMarks), which MapLibre's collision does not see, so they lay on
 * each other: "TOC" under badge 1, KDLH's ident under the TOD and TOC
 * pills, badges 3 and 4, 9 and 10, 14 and 15 over each other on C81 to
 * KDLH (the FPL audit's A12, 2026-11-08).
 *
 * At each rest of the map, highest first, each mark is kept where it
 * falls clear of those kept before it. One that may move (`nudge`, a top
 * of climb's pill) tries a little above, below, then to either side of
 * its point first; one that may not (a numbered checkpoint, which is
 * where it is) is left out until the map is closer in, where it clears.
 */
interface Decluttered {
  marker: Marker;
  /** Higher stays. */
  priority: number;
  /** Its own offset, which a nudge is added to. */
  offset: [number, number];
  /** Moved off its point to clear a higher one, rather than left out. */
  nudge?: boolean;
}

/** The route's marks' priorities, higher staying. */
export const ROUTE_PRIORITY = { destination: 5, field: 4, checkpoint: 3, legPoint: 1 } as const;

const NUDGES: [number, number][] = [[0, 0], [0, -20], [0, 20], [-30, 0], [30, 0]];
/** Points of a mark's edge another may overlap: a halo's, not a word's. */
const SLACK = 2;

interface Registry { marks: Set<Decluttered>; frame: number }
const registries = new WeakMap<GlMap, Registry>();

/** Into the map's set, laid out again at the next frame and at each rest;
 *  the returned function takes it out. */
export function declutter(map: GlMap, mark: Decluttered): () => void {
  let registry = registries.get(map);
  if (!registry) {
    const made: Registry = { marks: new Set(), frame: 0 };
    registry = made;
    registries.set(map, made);
    map.on("moveend", () => layOut(map, made));
  }
  registry.marks.add(mark);
  soon(map, registry);
  return () => {
    registry.marks.delete(mark);
    show(mark, [0, 0]);
    soon(map, registry);
  };
}

/** Laid out again at the next frame: a mark of the set moved. */
export function declutterSoon(map: GlMap) {
  const registry = registries.get(map);
  if (registry) soon(map, registry);
}

function soon(map: GlMap, registry: Registry) {
  if (registry.frame) return;
  registry.frame = requestAnimationFrame(() => { registry.frame = 0; layOut(map, registry); });
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right - SLACK && b.left < a.right - SLACK && a.top < b.bottom - SLACK && b.top < a.bottom - SLACK;

/** The mark's box on the screen, its drawing's children included (a
 *  pill's words run past the marker's own box). */
function boxOf(el: HTMLElement): Box {
  const own = el.getBoundingClientRect();
  const box = { left: own.left, top: own.top, right: own.right, bottom: own.bottom };
  for (const child of el.children) {
    const r = child.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    box.left = Math.min(box.left, r.left); box.top = Math.min(box.top, r.top);
    box.right = Math.max(box.right, r.right); box.bottom = Math.max(box.bottom, r.bottom);
  }
  return box;
}

function show(mark: Decluttered, nudge: [number, number] | null) {
  const el = mark.marker.getElement();
  if (nudge === null) {
    el.style.visibility = "hidden";
    el.dataset.declutter = "hidden";
    return;
  }
  el.style.visibility = "";
  if (nudge[0] || nudge[1]) el.dataset.declutter = "moved";
  else delete el.dataset.declutter;
  mark.marker.setOffset([mark.offset[0] + nudge[0], mark.offset[1] + nudge[1]]);
}

function layOut(map: GlMap, registry: Registry) {
  const marks = [...registry.marks].sort((a, b) => b.priority - a.priority);
  // Each on its own point first, to be measured there.
  for (const mark of marks) {
    mark.marker.setOffset(mark.offset);
    mark.marker.getElement().style.visibility = "";
  }
  const kept: Box[] = [];
  const { width, height } = map.getContainer().getBoundingClientRect();
  for (const mark of marks) {
    const at = boxOf(mark.marker.getElement());
    // Off the screen it takes no room and needs none.
    if (at.right < 0 || at.bottom < 0 || at.left > width + 400 || at.top > height + 400) { show(mark, [0, 0]); continue; }
    let placed: [number, number] | null = null;
    for (const [dx, dy] of mark.nudge ? NUDGES : NUDGES.slice(0, 1)) {
      const box = { left: at.left + dx, top: at.top + dy, right: at.right + dx, bottom: at.bottom + dy };
      if (!kept.some(k => overlaps(k, box))) { placed = [dx, dy]; kept.push(box); break; }
    }
    show(mark, placed);
  }
}
