import { queryOptions } from "@tanstack/react-query";
import { data, planner } from "../../../../lib/api/client";
import type { components } from "../../../../lib/api/schema";
import { AIRSPACE_INK, SUA_INK } from "../../../../lib/map/gl/glStyle";
import { TFR_RED } from "../tfrMarks";
import { groundSpan, volumeSpan, type GroundSpan, type VolumeHeights } from "./airspaceHeights";

/**
 * The volumes the 3D view stands up (AirspaceVolumesGl), each whole: the
 * Class B, C, D and surface E and the special use areas in view, as the
 * planner sends them from the cycle's pack (GET /api/airspace/volumes,
 * wingtip.airspace_volumes, where what is drawn is set out and sourced),
 * and the TFRs (/api/tfrs). Pure but for the query, so it is tested
 * without a map.
 */

export type VolumesAnswer = components["schemas"]["AirspaceVolumes"];
type Feature = { type?: string; geometry: { type: string; coordinates?: unknown }; properties: Record<string, unknown> };

/** The box asked for: the view's, out to the next half degree, so a pan
 *  within it asks nothing new; a state's width at most (the planner's
 *  MAX_SPAN_DEG). */
export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}
const HALF = (v: number, up: boolean) => (up ? Math.ceil(v * 2) : Math.floor(v * 2)) / 2;
export function boxOf(b: { south: number; west: number; north: number; east: number }, centre: { lat: number; lon: number }): Box {
  const span = 6;
  return {
    south: HALF(Math.max(b.south, centre.lat - span), false),
    north: HALF(Math.min(b.north, centre.lat + span), true),
    west: HALF(Math.max(b.west, centre.lon - span), false),
    east: HALF(Math.min(b.east, centre.lon + span), true),
  };
}

/** Each kind's ink, how see-through it is, and the app's zoom it is
 *  drawn from, so the view is not cluttered: far out only Class B and the
 *  special use areas; C from 9; D and surface E from 10. Class B blue, C
 *  magenta, D the fainter blue its dashed line is drawn in, a surface
 *  Class E faint magenta, the special use areas in SUA_INK, the TFRs
 *  red, a TFR not yet in force fainter. Strong enough to read over the
 *  chart, faint enough to see the ground and the route through two walls. */
export const KINDS = {
  B: { ink: AIRSPACE_INK.B.colour, opacity: 0.22, from: 7 },
  C: { ink: AIRSPACE_INK.C.colour, opacity: 0.2, from: 9 },
  D: { ink: AIRSPACE_INK.D.colour, opacity: 0.14, from: 10 },
  E: { ink: AIRSPACE_INK.E.colour, opacity: 0.08, from: 10 },
  restricted: { ink: SUA_INK.restricted, opacity: 0.16, from: 7 },
  moa: { ink: SUA_INK.moa, opacity: 0.13, from: 7 },
  tfr: { ink: TFR_RED, opacity: 0.3, from: 0 },
  tfrLater: { ink: TFR_RED, opacity: 0.12, from: 0 },
} as const;
export type Kind = keyof typeof KINDS;

/** The classes asked for at the app's zoom (KINDS' `from`). */
export const classesAt = (zoom: number) => (["B", "C", "D", "E"] as const).filter((c) => zoom >= KINDS[c].from);

/** The special use kinds by ink, by the FAA's TYPE_CODE (wingtip.sua
 *  TYPES), as the chart's specialUseLayers splits them: prohibited,
 *  restricted, warning and danger areas; MOAs and alert areas. */
const SUA_RESTRICTED = ["P", "R", "W", "D"];

export const volumesQuery = (box: Box, classes: readonly string[]) =>
  queryOptions({
    queryKey: ["airspace-volumes", box.south, box.west, box.north, box.east, classes.join()],
    queryFn: () =>
      planner.GET("/api/airspace/volumes", { params: { query: { ...box, classes: classes.join() } } }).then(data<VolumesAnswer>),
    staleTime: 60 * 60_000,
    placeholderData: (was) => was,
    meta: { silent: true },
  });

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const text = (v: unknown) => (v == null || v === "" ? null : String(v));

/** A volume's limits, which the engine reads (airspaceHeights): the NASR
 *  file's ceiling is MSL (wingtip.airspace_at._ceiling), its floor SFC,
 *  AGL or MSL (wingtip.airspace_at._floor); a special use area carries
 *  the FAA's own codes and descriptors (wingtip.sua `_area`), a TFR its
 *  references (tfr_read). */
function heightsOf(p: Record<string, unknown>): VolumeHeights {
  return {
    floor: { ft: num(p.floor_ft), code: text(p.floor_ref), desc: text(p.floor_desc) },
    ceiling: { ft: num(p.ceiling_ft), code: p.layer === "airspace" ? "MSL" : text(p.ceiling_ref), desc: text(p.ceiling_desc) },
  };
}

export const kindOf = (p: Record<string, unknown>): Kind =>
  p.layer === "tfr"
    ? p.active
      ? "tfr"
      : "tfrLater"
    : p.layer === "special_use"
      ? SUA_RESTRICTED.includes(String(p.type))
        ? "restricted"
        : "moa"
      : (String(p.class) as Kind);

/** One polygon of a volume as deck.gl draws it: its rings at its floor
 *  ([lon, lat, metres MSL]), how tall, the rims along its top (and its
 *  floor where that is off the ground), and the feature's fields, which a
 *  tap opens its card from. */
export interface VolumePiece {
  id: string;
  kind: Kind;
  properties: Record<string, unknown>;
  polygon: number[][][];
  heightM: number;
  topM: number;
  rims: number[][][];
}

/** A feature's polygons' rings, a multipolygon's each. */
const polygonsOf = (g: Feature["geometry"]): number[][][][] =>
  g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];

/** Of a ring's points, every nth, so the ground is read at no more than
 *  `most` of them. */
const sample = (ring: number[][], most = 48) => ring.filter((_, i) => i % Math.max(1, Math.ceil(ring.length / most)) === 0);

/** The pieces of the features, each at its own floor and ceiling over
 *  the ground `ground` reads (MapLibre's queryTerrainElevation), where it
 *  needs it. A volume above the ground waits for the terrain under it. */
export function piecesOf(features: Feature[], ground: (at: [number, number]) => number | null): VolumePiece[] {
  const out: VolumePiece[] = [];
  features.forEach((f, n) => {
    const polygons = polygonsOf(f.geometry);
    const heights = heightsOf(f.properties);
    let under: GroundSpan | null = null;
    if (polygons.length)
      under = groundSpan(
        polygons.flatMap((p) => sample(p[0] ?? [])),
        ground,
      );
    const span = volumeSpan(heights, under);
    if (!span) return;
    const kind = kindOf(f.properties);
    polygons.forEach((rings, k) => {
      const at = (z: number) => rings.map((r) => r.map((p) => [p[0]!, p[1]!, z]));
      out.push({
        id: `${n}-${k}`,
        kind,
        properties: f.properties,
        polygon: at(span.floorM),
        heightM: span.ceilingM - span.floorM,
        topM: span.ceilingM,
        rims: [...at(span.ceilingM), ...(span.surface ? [] : at(span.floorM))],
      });
    });
  });
  return out;
}

/** One label an area, by its name, at its top: the planner's `label`
 *  point, inside the area's largest polygon. An area drawn as several
 *  polygons (R-4207's parts, Brady Low's three floors) is named once. */
export function labelsOf(features: Feature[], pieces: VolumePiece[]): GeoJSON.FeatureCollection {
  const tops = new Map<Record<string, unknown>, number>();
  for (const p of pieces) tops.set(p.properties, Math.max(tops.get(p.properties) ?? 0, p.topM));
  const named = new Map<string, GeoJSON.Feature>();
  for (const f of features) {
    const p = f.properties;
    const top = tops.get(p);
    const at = p.label as number[] | undefined;
    if (p.layer !== "special_use" || top == null || !at || named.has(String(p.name))) continue;
    named.set(String(p.name), { type: "Feature", geometry: { type: "Point", coordinates: at }, properties: { ...p, top_m: top } });
  }
  return { type: "FeatureCollection", features: [...named.values()] };
}

/** A special use area's fields as the 3D view's volumes carry them (the
 *  planner's /api/airspace/volumes, as wingtip.sua reads the FAA's). */
export interface SuaArea {
  name: string;
  kind: string | null;
  floor_ft: number | null;
  floor_ref: string | null;
  ceiling_ft: number | null;
  ceiling_ref: string | null;
  times_of_use: string | null;
  controlling_agency: string | null;
}

/** A tapped area as its card reads it. */
export function suaOfVolume(p: Record<string, unknown>): SuaArea {
  return {
    name: String(p.name ?? ""),
    kind: text(p.kind),
    floor_ft: num(p.floor_ft),
    floor_ref: text(p.floor_ref),
    ceiling_ft: num(p.ceiling_ft),
    ceiling_ref: text(p.ceiling_ref),
    times_of_use: text(p.times_of_use),
    controlling_agency: text(p.controlling_agency),
  };
}
