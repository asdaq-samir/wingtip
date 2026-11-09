// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { feel } from "./haptics";
import { HAPTIC } from "./tokens";

const media = { matches: false };
const vibrate = vi.fn(() => true);

beforeAll(() => {
  window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
});

describe("feel", () => {
  beforeEach(() => {
    vibrate.mockClear();
    media.matches = false;
  });

  it("plays the token's pattern for the action", () => {
    feel("warning");
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC.warning]);
    feel("detent");
    expect(vibrate).toHaveBeenLastCalledWith([...HAPTIC.detent]);
  });

  it("is still with Reduce Motion", () => {
    media.matches = true;
    feel("directTo");
    expect(vibrate).not.toHaveBeenCalled();
  });
});
