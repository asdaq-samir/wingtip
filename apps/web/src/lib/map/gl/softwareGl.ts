import type { Map as GlMap } from "maplibre-gl";

/** A software rasteriser's name in WebGL's unmasked renderer string:
 *  Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' Basic
 *  Render Driver (WARP). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software/i;

let software: boolean | null = null;

/** Whether this browser's WebGL is drawn without a graphics chip, as where
 *  Chrome or Firefox turns the GPU off for a blocklisted driver or a
 *  virtual machine: a context asked with failIfMajorPerformanceCaveat is
 *  refused (WebGL 1.0, 5.2's WebGLContextAttributes), or the renderer
 *  names a software rasteriser (WEBGL_debug_renderer_info; Chrome's
 *  SwiftShader passes the first). Asked once. */
export function softwareGl(): boolean {
  if (software !== null) return software;
  software = false;
  try {
    const plain = document.createElement("canvas").getContext("webgl");
    if (!plain) return software;
    const fast = document.createElement("canvas").getContext("webgl", { failIfMajorPerformanceCaveat: true });
    const info = plain.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(plain.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    software = !fast || SOFTWARE.test(renderer);
    for (const gl of [plain, fast]) gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Asked as a hint: where it cannot be asked, the streaks move.
  }
  return software;
}

/** The 3D ground's mesh on a software renderer, squares a tile side
 *  (MapLibre's own is 128). */
const SOFTWARE_MESH = 32;

/**
 * The 3D ground made coarser where WebGL has no graphics chip under it,
 * once the map's terrain is set (TerrainGl). Each tile's mesh is MapLibre's
 * 128 squares a side, every vertex reading the heights, and on a software
 * renderer that was nearly the whole of a 3D frame: 0.8 to 1.4 s of the
 * Studio's chase view on two cores, 0.2 s at 32 (CI's SwiftShader, where
 * studio, terrain and airspace-3d.spec ran out their two minutes waiting
 * on frames). A height every eight of the DEM's pixels still stands the
 * ground up. Where there is a graphics chip, MapLibre's own.
 */
export function coarseGroundOnSoftware(map: GlMap) {
  if (softwareGl() && map.terrain) map.terrain.meshSize = SOFTWARE_MESH;
}
