import type { AirportPlace, ProcedureDrawing } from "../../../../lib/api/types";
import type { ApproachSceneInput } from "../../../../lib/engine/contract";
import { callEngine, type EngineAnswer } from "../../../../lib/engine/engine";
import { destination } from "../../../../lib/geo";
import { sameField } from "../../../../lib/procedures";
import type { AloftPoint } from "./geometry";

/*
 * A field's way in for the 3D view (ApproachGl), as the shapes it draws.
 * Every figure is the engine's `approach_scene` (engine/crates/route/src/
 * approach/scene.rs, where each is sourced): the centrelines' lengths, the
 * glidepath's angle, threshold crossing height and heights, the approach's
 * altitudes and the pattern's ring. This only turns its answer into lines
 * on the ground and points in the air.
 */

export type Scene = EngineAnswer<"approach_scene">;

/** The approach picked at `ident`, of the procedures picked for the route
 *  (useProcedurePicks): the first approach there, or none. */
export function pickedApproach(ident: string, picked: ProcedureDrawing[]): ProcedureDrawing | null {
  return picked.find((d) => d.kind === "approach" && sameField(d.airport, ident)) ?? null;
}

/** The engine's scene for a field, from what its card shows
 *  (/api/airport) and the approach picked there. */
export function approachScene(field: AirportPlace, approach: ProcedureDrawing | null): Scene {
  const input: ApproachSceneInput = {
    lat: field.lat,
    lon: field.lon,
    elevation_ft: field.elevation_ft ?? null,
    pattern_ft: field.pattern?.altitude_ft ?? null,
    runways: field.runways
      .filter((r) => !r.closed)
      .map((r) => ({
        length_ft: r.length_ft ?? null,
        runway_ends: (r.runway_ends ?? []).map((e) => ({
          ident: e.ident,
          lat: e.lat ?? null,
          lon: e.lon ?? null,
          heading_true_deg: e.heading_true_deg ?? null,
        })),
      })),
    drawing: (approach as ApproachSceneInput["drawing"]) ?? null,
  };
  return callEngine("approach_scene", input);
}

/** The engine's [lat, lon, ft] as a point in the air. */
export const aloft = (points: number[][]): AloftPoint[] => points.map(([lat, lon, ft]) => ({ lat: lat!, lon: lon!, altFt: ft! }));

/** The centrelines as lines on the ground, (lon, lat) as GeoJSON has it. */
export function centrelineFeatures(scene: Scene): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: scene.centrelines.map((c) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: c.points.map(([lat, lon]) => [lon, lat]) },
      properties: { end: c.end },
    })),
  };
}

/** The ring's points, one each 5 degrees round. */
const RING_POINTS = 72;

/** The ring as points in the air, all at the pattern's altitude: round
 *  its middle at the engine's radius. */
export function ringPoints(scene: Scene): AloftPoint[] {
  const ring = scene.ring;
  if (!ring) return [];
  const [lat, lon] = ring.center;
  return Array.from({ length: RING_POINTS + 1 }, (_, i) => ({
    ...destination({ lat, lon }, (360 * i) / RING_POINTS, ring.radius_nm),
    altFt: ring.ft,
  }));
}
