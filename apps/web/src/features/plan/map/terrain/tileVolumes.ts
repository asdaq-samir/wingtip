import type { VolumeHeights } from "./airspaceHeights";

/**
 * What the 3D map reads of the cycle's overlay tiles' volumes
 * (AirspaceVolumesGl): which are drawn, their floors and ceilings, and a
 * special use area as its card reads it. The fields are the charts job's
 * (services/jobs/charts/overlays.py: airspace_features from the NASR
 * Class Airspace shapefile, special_use_features from the FAA's special
 * use airspace service as wingtip.sua reads it).
 */

export type SourceLayer = "airspace" | "special_use";

/** The special use kinds by ink, by the FAA's TYPE_CODE (wingtip.sua
 *  TYPES), as the chart's specialUseLayers splits them: prohibited,
 *  restricted, warning and danger areas; MOAs and alert areas. */
export const SUA_RESTRICTED = ["P", "R", "W", "D"];
export const SUA_MOA = ["MOA", "A"];
/** Class E at the surface, by NASR's LOCAL_TYPE: a surface area designated
 *  for an airport (E2, 14 CFR 71.71(b)) and the extensions of one (E3,
 *  E4), and of those only a volume whose floor the file gives as the
 *  surface. The rest of Class E -- from 700 ft or more above the surface
 *  (71.71(c)), from 1,200 ft (71.71(e)) -- is everywhere and no volume to
 *  see, and is not drawn. */
export const SURFACE_E = ["CLASS_E2", "CLASS_E3", "CLASS_E4"];

/** Which tile features are drawn, as the layers' filters say. */
export const DRAWN: Record<SourceLayer, (p: Record<string, unknown>) => boolean> = {
  airspace: (p) =>
    ["B", "C", "D"].includes(String(p.class)) || (p.class === "E" && SURFACE_E.includes(String(p.local_type)) && !Number(p.floor_ft ?? 0)),
  special_use: (p) => [...SUA_RESTRICTED, ...SUA_MOA].includes(String(p.type)),
};

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const text = (v: unknown) => (v == null || v === "" ? null : String(v));

/** A tile feature's floor and ceiling: the NASR file's ceiling is MSL
 *  (wingtip.airspace_at._ceiling), its floor SFC, AGL or MSL
 *  (wingtip.airspace_at._floor); a special use area's both carry the
 *  service's own reference (LOWER_CODE, UPPER_CODE). */
export function heightsOf(layer: SourceLayer, p: Record<string, unknown>): VolumeHeights {
  return {
    floorFt: num(p.floor_ft),
    floorRef: text(p.floor_ref),
    ceilingFt: num(p.ceiling_ft),
    ceilingRef: layer === "airspace" ? "MSL" : text(p.ceiling_ref),
  };
}

/** A special use area's fields as the tiles carry them. */
export interface SuaTileArea {
  name: string;
  kind: string | null;
  floor_ft: number | null;
  floor_ref: string | null;
  ceiling_ft: number | null;
  ceiling_ref: string | null;
  times_of_use: string | null;
  controlling_agency: string | null;
}

/** A tapped area of the tiles as its card reads it. */
export function suaOfTile(p: Record<string, unknown>): SuaTileArea {
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
