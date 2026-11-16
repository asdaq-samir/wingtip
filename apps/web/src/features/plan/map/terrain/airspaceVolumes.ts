import { queryOptions } from "@tanstack/react-query";
import { data, planner } from "../../../../lib/api/client";
import type { components } from "../../../../lib/api/schema";
import { AIRSPACE_INK, SUA_INK } from "../../../../lib/map/gl/glStyle";
import { TFR_RED } from "../tfrMarks";
import { groundSpan, keptGround, volumeSpan, type GroundPoint, type GroundSpan, type VolumeHeights } from "./airspaceHeights";

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
 *  ([lon, lat, metres MSL, stood up by the Heights' stretch]), how tall
 *  (stretched too), the rims along its top (and its
 *  floor where that is off the ground), its floor in feet MSL (what it is
 *  shaded by), whether it holds the plan's altitudes (null with no plan),
 *  and the feature's fields, which a tap opens its card from. */
export interface VolumePiece {
  /** Its volume's key (volumeKey) and its polygon's place in it: the same
   *  across the planner's answers, as deck.gl's data and the labels keep. */
  id: string;
  volume: string;
  kind: Kind;
  properties: Record<string, unknown>;
  polygon: number[][][];
  heightM: number;
  topM: number;
  floorFt: number;
  holds: boolean | null;
  rims: number[][][];
}

/** A feature's polygons' rings, a multipolygon's each. */
const polygonsOf = (g: Feature["geometry"]): number[][][][] =>
  g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];

/** Of a ring's points, every nth, so the ground is read at no more than
 *  `most` of them. */
const sample = (ring: number[][], most = 48) => ring.filter((_, i) => i % Math.max(1, Math.ceil(ring.length / most)) === 0);

/** A volume's own key, the same in every answer the planner gives for
 *  it (a pan to a new box asks again): its kind, name and limits, and
 *  where its outline starts, as two parts of one area (Volk South's) have
 *  the same name and limits. */
function volumeKey(f: Feature): string {
  const p = f.properties;
  const ring = polygonsOf(f.geometry)[0]?.[0];
  return [
    p.layer,
    p.class,
    p.type,
    p.name,
    p.id,
    p.number,
    p.floor_ft,
    p.floor_ref,
    p.ceiling_ft,
    p.ceiling_ref,
    ring?.length,
    ring?.[0]?.join(),
  ].join("|");
}

/** The pieces of the features, each at its own floor and ceiling over
 *  the ground `ground` reads (TerrainGl's terrain, airspaceHeights'
 *  GroundPoint), where it needs it, and held against the plan's
 *  `altitudes` (ft MSL) where there is one. A volume above the ground
 *  waits for the terrain under it, and keeps the ground it was last drawn
 *  on (`kept`, by volumeKey, true metres) until the terrain under its
 *  whole outline is in again (airspaceHeights' keptGround).
 *
 *  `stretch`, the 3D view's Heights (lib/prefs' HeightStretch): the map's
 *  ground is drawn that many times its height, and `ground` reads it so,
 *  so the true ground is it over `stretch`; the engine's floor and
 *  ceiling, read over the true ground, are drawn `stretch` times their
 *  height, which keeps them where they are over the stretched ground (the
 *  heights are all MSL). Their feet, what they are shaded by and the
 *  labels' words, stay true. */
export function piecesOf(
  features: Feature[],
  ground: (at: [number, number]) => GroundPoint,
  altitudes: number[] | null = null,
  stretch = 1,
  kept = new Map<string, GroundSpan>(),
): VolumePiece[] {
  const trueGround = (at: [number, number]): GroundPoint => {
    const g = ground(at);
    return typeof g === "number" ? g / stretch : g;
  };
  const out: VolumePiece[] = [];
  for (const f of features) {
    const polygons = polygonsOf(f.geometry);
    if (!polygons.length) continue;
    const volume = volumeKey(f);
    const reading = groundSpan(
      polygons.flatMap((p) => sample(p[0] ?? [])),
      trueGround,
    );
    const under = keptGround(kept.get(volume) ?? null, reading);
    if (under) kept.set(volume, under);
    const span = volumeSpan(heightsOf(f.properties), under, altitudes);
    if (!span) continue;
    const kind = kindOf(f.properties);
    const [floorM, ceilingM] = [span.floorM * stretch, span.ceilingM * stretch];
    polygons.forEach((rings, k) => {
      const at = (z: number) => rings.map((r) => r.map((p) => [p[0]!, p[1]!, z]));
      out.push({
        id: `${volume}#${k}`,
        volume,
        kind,
        properties: f.properties,
        polygon: at(floorM),
        heightM: ceilingM - floorM,
        topM: ceilingM,
        floorFt: span.floorFt,
        holds: span.holds,
        rims: [...at(ceilingM), ...(span.surface ? [] : at(floorM))],
      });
    });
  }
  return out;
}

/** Whether two drawings are the same: each piece the same volume at the
 *  same heights, kind and plan's hold, with the same fields. */
function samePieces(a: VolumePiece[], b: VolumePiece[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i]!;
      return (
        p.id === q.id &&
        p.kind === q.kind &&
        p.heightM === q.heightM &&
        p.topM === q.topM &&
        p.floorFt === q.floorFt &&
        p.holds === q.holds &&
        p.polygon.length === q.polygon.length &&
        (p.properties === q.properties || JSON.stringify(p.properties) === JSON.stringify(q.properties))
      );
    })
  );
}

/**
 * The volumes as drawn, held from one look at the terrain to the next
 * (AirspaceVolumesGl): each volume's last good ground (piecesOf's `kept`),
 * and the last drawing itself, given again while nothing in it has
 * changed, so deck.gl's data and the labels' sources keep their identity
 * and nothing is redrawn as the terrain's tiles come in after a pan. A
 * drawing changes only when the volumes, their ground once settled, the
 * plan's altitudes or the stretch do.
 */
export class VolumeDrawing {
  private readonly grounds = new Map<string, GroundSpan>();
  private last: VolumePiece[] = [];

  pieces(features: Feature[], ground: (at: [number, number]) => GroundPoint, altitudes: number[] | null, stretch: number): VolumePiece[] {
    const next = piecesOf(features, ground, altitudes, stretch, this.grounds);
    if (!samePieces(this.last, next)) this.last = next;
    return this.last;
  }

  private shelvesWere: { json: string; labels: GeoJSON.FeatureCollection } | null = null;

  /** The shelves' labels (airspaceShelves' shelfLabelsOf), given again
   *  as they were while written the same: placed afresh as the camera
   *  comes to rest, they mostly come out the same after a short pan, and
   *  a source set anew has MapLibre place every tab again, fading them
   *  out and in. */
  shelves(labels: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
    const json = JSON.stringify(labels);
    if (this.shelvesWere?.json !== json) this.shelvesWere = { json, labels };
    return this.shelvesWere.labels;
  }
}

/** One label an area, by its name, at its top: the planner's `label`
 *  point, inside the area's largest polygon. An area drawn as several
 *  polygons (R-4207's parts, Brady Low's three floors) is named once, at
 *  the highest of their tops. From the pieces alone, so a drawing kept
 *  across the planner's answers (VolumeDrawing) keeps its labels too. */
export function labelsOf(pieces: VolumePiece[]): GeoJSON.FeatureCollection {
  const named = new Map<string, { at: number[]; p: Record<string, unknown>; top: number }>();
  for (const piece of pieces) {
    const p = piece.properties;
    const at = p.label as number[] | undefined;
    if (p.layer !== "special_use" || !at) continue;
    const name = String(p.name);
    const was = named.get(name);
    if (!was) named.set(name, { at, p, top: piece.topM });
    else if (was.p === p) was.top = Math.max(was.top, piece.topM);
  }
  return {
    type: "FeatureCollection",
    features: [...named.values()].map(({ at, p, top }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: at },
      properties: { ...p, top_m: top },
    })),
  };
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
