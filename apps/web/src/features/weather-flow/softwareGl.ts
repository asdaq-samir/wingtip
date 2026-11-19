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
