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

/** Of a ring's points, the one nearest `eye` ([lon, lat]), the ground
 *  under the camera: the shelf's edge facing the viewer. Distances on the
 *  plane, longitude shrunk by the latitude's cosine, as near enough to
 *  pick a point. With no eye, the southernmost: the camera's side when
 *  the map faces north. */
function nearest(ring: number[][], eye: [number, number] | null): number[] | undefined {
  let best: number[] | undefined,
    d = Infinity;
  for (const p of ring) {
    const k = eye ? ((p[0]! - eye[0]) * Math.cos((eye[1] * Math.PI) / 180)) ** 2 + (p[1]! - eye[1]) ** 2 : p[1]!;
    if (k < d) [best, d] = [p, k];
  }
  return best;
}

/** One label a shelf, at its top, on the edge of it nearest the camera:
 *  its words (shelfText), its class for its tab, its top in metres for
 *  MapLibre to lift it to, and its floor, the lower placed first where
 *  labels meet. A shelf drawn as several polygons is labelled once. */
export function shelfLabelsOf(pieces: VolumePiece[], eye: [number, number] | null): GeoJSON.FeatureCollection {
  const seen = new Set<Record<string, unknown>>();
  const features: GeoJSON.Feature[] = [];
  for (const piece of pieces) {
    const p = piece.properties;
    if (seen.has(p)) continue;
    seen.add(p);
    const text = shelfText(p);
    const at = text ? nearest(piece.polygon[0] ?? [], eye) : undefined;
    if (!text || !at) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [at[0]!, at[1]!] },
      properties: { text, class: p.class, top_m: piece.topM, floor_ft: piece.floorFt, held: piece.holds !== false },
    });
  }
  return { type: "FeatureCollection", features };
}

/** The labels' layer: the 2D chart's airspace tab (a dark tab bordered in
 *  the class's ink, glOverlays' airspaceTab) standing on the shelf's top
 *  (MapLibre's symbol-height-offset, as the special use names are lifted)
 *  and facing the screen, kept off each other by MapLibre's own
 *  collision: Class B first, then C and D, the lower floor first; a label
 *  of a volume the plan is not at fainter, still legible. */
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
      "symbol-sort-key": ["+", ["*", ["match", ["get", "class"], "B", 0, "C", 1, 2], 100_000], ["get", "floor_ft"]],
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
