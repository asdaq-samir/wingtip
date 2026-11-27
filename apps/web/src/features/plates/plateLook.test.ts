import { describe, expect, it } from "vitest";
import { migratePlateLook as migrate, usePlateLook } from "./plateLook";

/** How a kept plate look is read after the update: version 1 kept
 *  "false" for every pilot who never touched Invert Plate Colors, which
 *  drew a white plate on the dark map at night (the themes audit,
 *  2026-11-27); it is read as no choice, so the plate follows the
 *  appearance (usePlateInverted), and a kept "true" stays the pilot's. */
describe("the plate look's kept choice", () => {
  it("reads version 1's false as no choice", () => {
    expect(migrate({ opacity: 0.85, inverted: false, annotations: true }, 1)).toMatchObject({ inverted: null });
  });

  it("keeps a chosen white-on-black", () => {
    expect(migrate({ opacity: 0.85, inverted: true, annotations: true }, 1)).toMatchObject({ inverted: true });
  });

  it("follows the appearance by default", () => {
    expect(usePlateLook.getInitialState().inverted).toBeNull();
  });
});
