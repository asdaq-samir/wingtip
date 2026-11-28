import { describe, expect, it } from "vitest";
import { followMs, followStep, pickHow, scrubGlide, verdict, FOLLOW_JUMP_UNDER_PX, SCRUB_GLIDE } from "./cameraRules";

describe("the camera owner's rules", () => {
  it("lets a follow's step go by while a pick, a fit or the pilot's hand has the camera, and never holds up a pick", () => {
    // FL-7: the tracking's follow cut the flight to the airplane short.
    expect(verdict("pick", "track")).toBe("wait");
    // FL-22: own ship's first fix under the route's first fit.
    expect(verdict("fit", "own-ship")).toBe("wait");
    expect(verdict("hand", "dry-run")).toBe("wait");
    // A follow continues itself, and takes over from another follow.
    expect(verdict("dry-run", "dry-run")).toBe("go");
    expect(verdict("own-ship", "track")).toBe("go");
    expect(verdict(null, "own-ship")).toBe("go");
    // A pick or a fit is the pilot's choice, made now: it always goes.
    expect(verdict("hand", "pick")).toBe("go");
    expect(verdict("dry-run", "fit")).toBe("go");
  });

  it("eases each follow step over the time since the last, so the steps join at one pace", () => {
    // FL-13: the dry run's fixes a quarter second apart.
    expect(followMs(250)).toBe(250);
    expect(followMs(null)).toBe(250);
    // Not shorter than a frame-rate stream needs, nor a slow creep.
    expect(followMs(16)).toBe(100);
    expect(followMs(2000)).toBe(1500);
    // A stream begun again after a pause starts afresh.
    expect(followMs(10_000)).toBe(250);
  });

  it("eases a pick within a few screens, and flies one far off or far in", () => {
    // FL-18: an airport from the search a screen away, one level in.
    expect(pickHow(800, 852, 1)).toBe("ease");
    expect(pickHow(3 * 852, 852, 0)).toBe("ease");
    expect(pickHow(3 * 852 + 1, 852, 0)).toBe("fly");
    expect(pickHow(100, 852, 5)).toBe("fly");
  });

  it("jumps own ship's small steps once a fix and eases every other follow, the dry run's glide kept", () => {
    expect(followStep("own-ship", FOLLOW_JUMP_UNDER_PX - 1)).toBe("jump");
    expect(followStep("own-ship", FOLLOW_JUMP_UNDER_PX)).toBe("ease");
    expect(followStep("dry-run", 1)).toBe("ease");
    expect(followStep("track", 1)).toBe("ease");
    expect(followStep("replay", 1)).toBe("ease");
  });

  it("glides a scrub's press, aims the glide again for the time it has left, and lets each move jump once it is over", () => {
    expect(scrubGlide("glide", 0, 1000)?.ends).toBe(1000 + SCRUB_GLIDE.duration);
    expect(scrubGlide(true, 1250, 1100)).toMatchObject({ ends: 1250, timing: { duration: 150 } });
    expect(scrubGlide(true, 1250, 1240)).toBeNull();
    expect(scrubGlide(true, 0, 1000)).toBeNull();
    expect(scrubGlide(false, 1250, 1100)).toBeNull();
  });
});
