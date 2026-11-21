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

/** What MapLibre's render-to-texture keeps of its size: the side of the
 *  texture each terrain tile's flat layers are drawn into, its tile size
 *  times Terrain.qualityFactor, read once as the terrain is set. */
type Drape = { renderToTexture?: { rttSize?: number } };

/**
 * The 3D ground made coarser where WebGL has no graphics chip under it,
 * once the map's terrain is set (TerrainGl). Each tile's mesh is MapLibre's
 * 128 squares a side, every vertex reading the heights, and on a software
 * renderer that was nearly the whole of a 3D frame: 0.8 to 1.4 s of the
 * Studio's chase view on two cores, 0.2 s at 32 (CI's SwiftShader, where
 * studio, terrain and airspace-3d.spec ran out their two minutes waiting
 * on frames). A height every eight of the DEM's pixels still stands the
 * ground up.
 *
 * And the chart draped on it at the tile's own size, not twice it. In 3D
 * MapLibre draws the chart, the relief and every line into a texture per
 * terrain tile and stack of layers (1024 px square at its qualityFactor of
 * 2), all of them again at each change of the style: every icon added,
 * every layer, and the first seconds of 3D bring some twenty. On two cores
 * of SwiftShader each such redraw was some 2.5 s of the GPU's work, which
 * the page did not wait on until the compositor read the canvas back: one
 * frame of 13 to 20 s about 20 s into 3D on CI, two workers making it
 * longer than airspace-3d.spec's two minutes. At 512 px the textures are a
 * quarter of the pixels (qualityFactor 1, which MapLibre reads only as the
 * terrain is made, so its render-to-texture is told too). Where there is a
 * graphics chip, MapLibre's own mesh and textures.
 */
export function coarseGroundOnSoftware(map: GlMap) {
  if (!softwareGl() || !map.terrain) return;
  map.terrain.meshSize = SOFTWARE_MESH;
  const drape = (map.painter as unknown as Drape).renderToTexture;
  if (drape?.rttSize && map.terrain.qualityFactor > 1) {
    drape.rttSize /= map.terrain.qualityFactor;
    map.terrain.qualityFactor = 1;
  }
}
