import type { SymbolLayerSpecification } from "maplibre-gl";
import { callEngine } from "../../../../lib/engine/engine";
import { airspaceTab } from "../../../../lib/map/gl/glStyle";
import { GL_FONT_BOLD } from "../../../../lib/map/gl/layers/common";
import { rgbOf } from "../../../../lib/rgb";
import { CHART, MAP } from "../../../../lib/tokens";
import type { AloftPoint } from "./geometry";
import type { VolumePiece } from "./airspaceVolumes";

/**
 * What makes a Class B's shelves read as different altitudes in 3D (the
 * owner, 2026-11-14: "the class B airspace shelves are not differentiating
 * altitudes"), at true scale, where a 3,000-10,000 ft shelf is a thin
 * ring:
 *
 * - each shelf labelled at its top as the sectional writes it, its
 *   ceiling over its floor in hundreds of feet ("100" over "30"): the
 *   engine's words (`airspace_shelf_label`, the Chart User's Guide's);
 * - each volume shaded by its floor within its class's ink, the lower the
 *   darker (the tokens' airspace-floor-low and -high, airspace-shade-*);
 * - with a plan, the volumes at its altitudes drawn stronger and the rest
 *   fainter; whether a volume holds an altitude is the engine's
 *   (`airspace_volume_span`'s `holds`, airspaceHeights).
 *
 * Pure, so tested without a map.
 */

/** The altitudes a plan flies, ft MSL, for the volumes to be held against:
 *  each leg's own (the nav log's, useRouteAloft's `legFt`), which is its
 *  cruise where it has no other; null with no plan, when nothing fades. */
export function planAltitudes(aloft: AloftPoint[] | null): number[] | null {
  if (!aloft || aloft.length < 2) return null;
  return [...new Set(aloft.map((p) => Math.round(p.legFt ?? p.altFt)))];
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t));

/** A volume's colour as deck.gl takes it: its class's ink mixed toward
 *  the tokens' dark at a surface floor and toward their light at
 *  MAP.airspaceShadeTopFt and over, through the ink itself half way; and
 *  how opaque, `alpha` times the tokens' held or faded where a plan's
 *  altitudes were asked (`holds` true or false), as it is with none. */
export function shadeOf(ink: string, floorFt: number, alpha: number, holds: boolean | null): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, floorFt / MAP.airspaceShadeTopFt));
  const [toward, by] = t < 0.5 ? [CHART.airspaceFloorLow, (0.5 - t) * 2] : [CHART.airspaceFloorHigh, (t - 0.5) * 2];
  const rgb = mix(rgbOf(ink), rgbOf(toward), by * MAP.airspaceShadeMix);
  const strength = holds == null ? 1 : holds ? MAP.airspaceHeld : MAP.airspaceFaded;
  return [rgb[0]!, rgb[1]!, rgb[2]!, Math.round(Math.min(1, alpha * strength) * 255)];
}

/** The volume's class's altitudes as the sectional writes them (the
 *  engine's `airspace_shelf_label`): "100\n30", "-30"; null for what the
 *  chart writes none for (a Class E surface area, a special use area, a
 *  TFR, whose names their own tabs carry). */
export function shelfText(p: Record<string, unknown>): string | null {
  if (p.layer !== "airspace") return null;
  const num = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const label = callEngine("airspace_shelf_label", {
    class: String(p.class ?? ""),
    floor_ft: num(p.floor_ft),
    floor_ref: p.floor_ref == null ? null : String(p.floor_ref),
    ceiling_ft: num(p.ceiling_ft),
    ceiling_excluded: p.ceiling_excluded === true,
  });
  return label?.text ?? null;
}

/** Kilometres on the plane near `lat`, longitude shrunk by the latitude's
 *  cosine: near enough to space labels a few kilometres apart. */
const KM_PER_DEG = 111.32;
const km = (a: number[], b: number[], lat: number) =>
  Math.hypot((a[0]! - b[0]!) * Math.cos((lat * Math.PI) / 180), a[1]! - b[1]!) * KM_PER_DEG;

/** Of a ring's points, the index of the one nearest `eye` ([lon, lat]),
 *  the ground under the camera: the shelf's edge facing the viewer. With
 *  no eye, the southernmost: the camera's side when the map faces north. */
function nearestAt(ring: number[][], eye: [number, number] | null): number {
  let best = 0,
    d = Infinity;
  ring.forEach((p, i) => {
    const k = eye ? km(p, eye, eye[1]) : p[1]!;
    if (k < d) [best, d] = [i, k];
  });
  return best;
}

/** How many places a shelf's label may stand in, at most (about every 45
 *  degrees round a ring), and how far apart at least, km: MapLibre's
 *  collision keeps whichever fit, so each shelf shows its altitudes
 *  somewhere in view, never crowded on another of its own. */
const LABEL_PLACES = 8;
const LABEL_APART_KM = 8;

/** Points spread evenly along a ring by its length, from its point
 *  nearest the camera, the nearest first and then outward each way round,
 *  LABEL_APART_KM apart at least and LABEL_PLACES at most. */
function placesOn(ring: number[][], eye: [number, number] | null): number[][] {
  const n = ring.length;
  if (n < 2) return ring.slice(0, 1);
  const lat = ring[0]![1]!;
  const start = nearestAt(ring, eye);
  // The ring walked from the nearest point round to it again (its last
  // point is its first, as a GeoJSON ring's is).
  const walk = [...ring.slice(start, n - 1), ...ring.slice(0, start + 1)];
  const along = [0];
  for (let i = 1; i < walk.length; i++) along.push(along[i - 1]! + km(walk[i - 1]!, walk[i]!, lat));
  const length = along.at(-1)!;
  const count = Math.max(1, Math.min(LABEL_PLACES, Math.floor(length / LABEL_APART_KM)));
  const at = (d: number) => {
    let i = 1;
    while (i < walk.length - 1 && along[i]! < d) i++;
    const [a, b] = [walk[i - 1]!, walk[i]!];
    const span = along[i]! - along[i - 1]!;
    const t = span > 0 ? Math.min(1, Math.max(0, (d - along[i - 1]!) / span)) : 0;
    return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t];
  };
  // Nearest first, then a step either way round: 0, 1, -1, 2, -2, ...
  const steps = Array.from({ length: count }, (_, k) => (k % 2 ? (k + 1) / 2 : -k / 2));
  return steps.map((k) => at(((((k * length) / count) % length) + length) % length));
}

/** A shelf's label at its top, in several places along its edge
 *  (placesOn), the nearest the camera first: its words (shelfText), its
 *  class for its tab, its top in metres for MapLibre to lift it to, its
 *  floor, and each place's rank, by which the layer tries every shelf's
 *  first place before any shelf's next. A shelf drawn as several polygons
 *  is labelled along its first. */
export function shelfLabelsOf(pieces: VolumePiece[], eye: [number, number] | null): GeoJSON.FeatureCollection {
  const seen = new Set<Record<string, unknown>>();
  const features: GeoJSON.Feature[] = [];
  for (const piece of pieces) {
    const p = piece.properties;
    if (seen.has(p)) continue;
    seen.add(p);
    const text = shelfText(p);
    if (!text) continue;
    placesOn(piece.polygon[0] ?? [], eye).forEach((at, rank) =>
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [at[0]!, at[1]!] },
        properties: { text, class: p.class, top_m: piece.topM, floor_ft: piece.floorFt, held: piece.holds !== false, rank },
      }),
    );
  }
  return { type: "FeatureCollection", features };
}

/** The labels' layer: the 2D chart's airspace tab (a dark tab bordered in
 *  the class's ink, glOverlays' airspaceTab) standing on the shelf's top
 *  (MapLibre's symbol-height-offset, as the special use names are lifted)
 *  and facing the screen, kept off each other by MapLibre's own
 *  collision: each shelf's nearest place first, then Class B, C and D, the
 *  lower floor first; a label of a volume the plan is not at fainter,
 *  still legible. */
export function shelfLabelLayer(id: string, source: string): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source,
    layout: {
      "text-field": ["get", "text"],
      "text-font": GL_FONT_BOLD,
      "text-size": 12,
      "text-line-height": 1.1,
      "text-anchor": "bottom",
      "text-pitch-alignment": "viewport",
      "text-rotation-alignment": "viewport",
      "icon-image": ["concat", airspaceTab(""), ["get", "class"]],
      "icon-anchor": "bottom",
      "icon-text-fit": "both",
      "icon-text-fit-padding": [2, 6, 2, 6],
      "icon-pitch-alignment": "viewport",
      "text-padding": 4,
      "text-allow-overlap": false,
      "icon-allow-overlap": false,
      // Every shelf's nearest place before any shelf's next (its rank),
      // then Class B, C and D, the lower floor first.
      "symbol-sort-key": [
        "+",
        ["*", ["get", "rank"], 1_000_000],
        ["*", ["match", ["get", "class"], "B", 0, "C", 1, 2], 100_000],
        ["get", "floor_ft"],
      ],
      "symbol-height-offset": ["get", "top_m"],
      "symbol-height-anchor": "absolute",
    },
    paint: {
      "text-color": CHART.casing,
      "text-opacity": ["case", ["get", "held"], 1, MAP.airspaceLabelFaded],
      "icon-opacity": ["case", ["get", "held"], 1, MAP.airspaceLabelFaded],
    },
  };
}
