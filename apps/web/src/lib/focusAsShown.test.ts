// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusAsShown } from "./focusAsShown";

/** A field hidden under a card for `hiddenFrames` frames, then shown. */
function field(hiddenFrames: number) {
  const el = document.createElement("input");
  document.body.append(el);
  let looks = 0;
  el.checkVisibility = () => ++looks > hiddenFrames;
  return el;
}

describe("focusAsShown", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("focuses the field on the frame it shows, not before", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const el = field(3);
    const focus = vi.fn(() => el.focus());
    focusAsShown(() => el, focus);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(focus).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(el);
  });

  it("asks nothing once the field has the focus, and stops when cancelled", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const shown = field(0);
    shown.focus();
    const focus = vi.fn();
    focusAsShown(() => shown, focus);
    vi.advanceTimersToNextFrame();
    expect(focus).not.toHaveBeenCalled();

    const hidden = field(100);
    const cancel = focusAsShown(() => hidden, focus);
    cancel();
    for (let i = 0; i < 40; i++) vi.advanceTimersToNextFrame();
    expect(focus).not.toHaveBeenCalled();
  });

  it("gives up after half a second of frames with the field still hidden", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const el = field(100);
    const focus = vi.fn();
    focusAsShown(() => el, focus);
    for (let i = 0; i < 100; i++) vi.advanceTimersToNextFrame();
    expect(focus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
