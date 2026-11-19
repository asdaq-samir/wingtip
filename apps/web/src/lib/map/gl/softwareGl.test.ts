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
