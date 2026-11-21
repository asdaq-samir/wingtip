// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

/** A WebGL context whose renderer is `renderer`, refused where `caveat`
 *  is asked and `refused` is set. */
function fakeGl(renderer: string, refused = false) {
  const gl = {
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
    getParameter: () => renderer,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((_kind: string, attrs?: WebGLContextAttributes) =>
    refused && attrs?.failIfMajorPerformanceCaveat ? null : gl) as never);
}

async function asked() {
  vi.resetModules();
  return (await import("./softwareGl")).softwareGl();
}

describe("whether WebGL is drawn without a graphics chip", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names Chrome's SwiftShader software, which the caveat lets through", async () => {
    fakeGl("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)");
    expect(await asked()).toBe(true);
  });

  it("takes a context refused for a major performance caveat as software", async () => {
    fakeGl("ANGLE (Apple, ANGLE Metal Renderer: Apple M4)", true);
    expect(await asked()).toBe(true);
  });

  it("leaves a graphics chip's renderer moving", async () => {
    fakeGl("ANGLE (Apple, ANGLE Metal Renderer: Apple M4)");
    expect(await asked()).toBe(false);
  });
});

/** A map whose terrain is just set, as MapLibre makes it: a mesh of 128,
 *  its drape twice the 512 px tile. */
const raisedMap = () => ({ terrain: { meshSize: 128, qualityFactor: 2 }, painter: { renderToTexture: { rttSize: 1024 } } });

async function coarsened(renderer: string) {
  fakeGl(renderer);
  vi.resetModules();
  const { coarseGroundOnSoftware } = await import("./softwareGl");
  const map = raisedMap();
  // Twice, as a second effect run would: the drape is halved once.
  coarseGroundOnSoftware(map as never);
  coarseGroundOnSoftware(map as never);
  return map;
}

describe("the 3D ground on a software renderer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is a coarser mesh draped at the tile's own size", async () => {
    const map = await coarsened("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)");
    expect(map.terrain).toEqual({ meshSize: 32, qualityFactor: 1 });
    expect(map.painter.renderToTexture.rttSize).toBe(512);
  });

  it("is MapLibre's own on a graphics chip", async () => {
    expect(await coarsened("ANGLE (Apple, ANGLE Metal Renderer: Apple M4)")).toEqual(raisedMap());
  });
});
