import { addProtocol, type AddProtocolAction, type ColorReliefLayerSpecification } from "maplibre-gl";
import { useEffect } from "react";
import { callEngine } from "../../../../lib/engine/engine";
import { slotId, useGlMap } from "../../../../lib/map/gl/glLayer";
import {
  coursePieces,
  corridorBounds,
  heightsOverPlan,
  OUTSIDE_M,
  piecesNear,
  terrariumHeights,
  terrariumPixels,
  type CoursePiece,
} from "./clearance";
import { demSource } from "./dem";
import type { AloftPoint } from "./geometry";
import { svColours } from "./svColours";

const CLEARANCE_DEM = "terrain-clearance-dem";
const CLEARANCE_TINT = "terrain-clearance";
const PROTOCOL = "wingtip-clearance";
/** The pilot's-eye view's tint's strength (PilotCamera), so the two read alike. */
const OPACITY = 0.55;

/** The routes the protocol answers for, by the key in their tiles' address. */
const routes = new Map<string, { pieces: CoursePiece[]; corridorNm: number; origin: string }>();
let made = 0;
let registered = false;

/** A tile's pixels as MapLibre takes them, decoded once (ImageBitmap). */
const bitmap = (heights: Float32Array, size: number) => createImageBitmap(new ImageData(terrariumPixels(heights), size, size));
/** A tile's side, px: the planner's terrain tiles' (demSource's tileSize). */
const TILE_PX = 256;
/** A tile all outside the corridor, the size of the others (a raster-dem
 *  source's tiles are all one size): its pixels made once, a bitmap a
 *  tile, as MapLibre hands each to its worker and lets it go. */
let outside: ImageData | null = null;
const allOutside = () =>
  createImageBitmap((outside ??= new ImageData(terrariumPixels(new Float32Array(TILE_PX * TILE_PX).fill(OUTSIDE_M)), TILE_PX, TILE_PX)));

/**
 * The `wingtip-clearance://` tiles: the planner's terrain tile, the very
 * one the 3D ground stands on (dem.ts; from the browser's cache once the
 * ground has asked it), made heights over the plan (clearance.ts). A tile
 * no piece of the course comes near is all outside, and nothing is
 * fetched for it.
 */
const load: AddProtocolAction = async (params, abort) => {
  const m = /^wingtip-clearance:\/\/(\d+)\/(\d+)\/(\d+)\?route=(\d+)$/.exec(params.url);
  const route = m ? routes.get(m[4]!) : undefined;
  const tile = { z: Number(m?.[1]), x: Number(m?.[2]), y: Number(m?.[3]) };
  if (!route || !piecesNear(tile, route.pieces, route.corridorNm).length) return { data: await allOutside() };
  const url = demSource(route.origin)
    .tiles![0]!.replace("{z}", String(tile.z))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y));
  const res = await fetch(url, { signal: abort.signal });
  if (!res.ok) throw new Error(`The terrain tile could not be had (${res.status}).`);
  const png = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const size = png.width;
  const ctx = new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(png, 0, 0);
  png.close();
  const ground = terrariumHeights(ctx.getImageData(0, 0, size, size).data);
  return { data: await bitmap(heightsOverPlan(ground, size, tile, route.pieces, route.corridorNm), size) };
};

/**
 * The ground near the route coloured against the plan while planning in
 * 3D, as the dry run's pilot's-eye view colours it against the airplane
 * (PilotCamera): within the engine's corridor either side of the course
 * (`floor_corridor_nm`, the VFR floor's 5 nm), each point against the
 * planned altitude of the nav log's leg nearest it -- amber within the
 * engine's band below it, red at and above it (svColours, against 0, as
 * the tiles are heights over the plan). The rest of the chart as it is.
 * A view of the plan, not terrain clearance: no TAWS, and nothing of 14
 * CFR 91.119 or 91.177's minimums, which the plan's altitudes answer; the
 * Map Settings' Terrain row says so while 3D is on.
 */
export default function ClearanceGl({ points }: { points: AloftPoint[] }) {
  const { map } = useGlMap();
  useEffect(() => {
    if (!registered) {
      addProtocol(PROTOCOL, load);
      registered = true;
    }
    const corridorNm = callEngine("floor_corridor_nm", {});
    const key = String(++made);
    const origin = window.location.origin;
    routes.set(key, { pieces: coursePieces(points), corridorNm, origin });
    map.addSource(CLEARANCE_DEM, {
      ...demSource(origin),
      bounds: corridorBounds(points, corridorNm),
      tiles: [`${PROTOCOL}://{z}/{x}/{y}?route=${key}`],
    });
    const tint: ColorReliefLayerSpecification = {
      id: CLEARANCE_TINT,
      type: "color-relief",
      source: CLEARANCE_DEM,
      paint: { "color-relief-opacity": OPACITY, "color-relief-color": svColours(0) },
    };
    map.addLayer(tint, slotId("imagery"));
    const el = map.getContainer();
    el.dataset.terrainClearance = String(corridorNm);
    return () => {
      routes.delete(key);
      delete el.dataset.terrainClearance;
      if (!map.style) return;
      if (map.getLayer(CLEARANCE_TINT)) map.removeLayer(CLEARANCE_TINT);
      if (map.getSource(CLEARANCE_DEM)) map.removeSource(CLEARANCE_DEM);
    };
  }, [map, points]);
  return null;
}
