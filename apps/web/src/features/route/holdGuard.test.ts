import { describe, expect, it } from "vitest";
import { holdGuard } from "./holdGuard";

// Integration's stops-reorder spec, "on a touch screen" (2026-11-12): the
// menu a held pill opened went as the finger lifted.
describe("a pill held till its menu opens", () => {
  it("cancels the lift that follows, so the menu stays", () => {
    const guard = holdGuard();
    guard.down(true);
    guard.opened();
    expect(guard.lifted()).toBe(true);
  });

  it("lets a tap be a tap: no menu opened, nothing cancelled", () => {
    const guard = holdGuard();
    guard.down(true);
    expect(guard.lifted()).toBe(false);
  });

  it("leaves a mouse's right-click alone", () => {
    const guard = holdGuard();
    guard.down(false);
    guard.opened();
    expect(guard.lifted()).toBe(false);
  });

  it("cancels one lift only: the next tap is the pill's", () => {
    const guard = holdGuard();
    guard.down(true);
    guard.opened();
    guard.lifted();
    guard.down(true);
    expect(guard.lifted()).toBe(false);
  });
});
