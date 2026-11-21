import { afterEach, describe, expect, it } from "vitest";
import { helpImproveOn, inSpeedSample, resetSpeedSample, setHelpImprove, SPEED_SAMPLE } from "./helpImprove";

describe("Help Improve Wingtip Maps", () => {
  afterEach(() => {
    setHelpImprove(true);
    resetSpeedSample();
  });

  it("is on until the pilot turns it off", () => {
    expect(helpImproveOn()).toBe(true);
    setHelpImprove(false);
    expect(helpImproveOn()).toBe(false);
  });

  it("samples a page load once, so its figures go together or not at all", () => {
    expect(inSpeedSample(() => SPEED_SAMPLE / 2)).toBe(true);
    // Drawn once a load: a second draw does not change it.
    expect(inSpeedSample(() => 0.99)).toBe(true);
    resetSpeedSample();
    expect(inSpeedSample(() => SPEED_SAMPLE)).toBe(false);
  });
});
