import { describe, expect, it, vi } from "vitest";
import { CARD, CARD_WIDE, FLOAT_PX, insetsOf, letGo, shownPx, sizeAt, snapsOf } from "./insets";

describe("insetsOf", () => {
  it("leaves a phone's map the strip the sheet in sight covers", () => {
    expect(insetsOf("peek", 62, true, true, 59)).toEqual({ top: 59, bottom: 62, left: 0, out: false, up: false });
    expect(insetsOf("full", 376, true, true, 59)).toEqual({ top: 59, bottom: 376, left: 0, out: true, up: true });
    // A sheet from the top covers the status bar itself.
    expect(insetsOf("half", 376, true, false, 59)).toEqual({ top: 376, bottom: 0, left: 0, out: true, up: false });
  });

  it("leaves a wider screen's map all but the side panel's column while it is out", () => {
    expect(insetsOf("half", 0, false, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD, out: true, up: false });
    // A desktop's side panel is wider, and so is what it covers.
    expect(insetsOf("full", 0, false, true, 0, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD_WIDE, out: true, up: true });
    // At rest, its head in the top corner whichever edge the phone's sheet is on.
    expect(insetsOf("peek", 62, false, true)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
    expect(insetsOf("peek", 62, false, false)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
  });
});

describe("the snap points", () => {
  it("are the same values every time, in the Drawer's own units", () => {
    expect(snapsOf(true).points).toBe(snapsOf(true).points);
    expect(snapsOf(true).points).toEqual(["4.25rem", "23rem", 1]);
    expect(snapsOf(false).points).toEqual(["5.25rem", "23rem", 1]);
  });

  it("give each size's height in sight as the Drawer resolves it, no taller than the popup", () => {
    // 16 px to the rem; the popup 780 tall.
    expect(shownPx("peek", true, 780, 16)).toBe(68);
    expect(shownPx("peek", false, 780, 16)).toBe(84);
    expect(shownPx("half", true, 780, 16)).toBe(368);
    expect(shownPx("full", true, 780, 16)).toBe(780);
    // A short screen: half no taller than the popup.
    expect(shownPx("half", true, 300, 16)).toBe(300);
  });

  it("map the Drawer's point back to a size by identity", () => {
    expect(sizeAt(true, "4.25rem")).toBe("peek");
    expect(sizeAt(true, "23rem")).toBe("half");
    expect(sizeAt(false, 1)).toBe("full");
    expect(sizeAt(true, 0.5)).toBeUndefined();
  });
});

/**
 * A drag let go past the pill is refused where the Drawer asks, before it
 * starts a close, and the card goes to the pill: let through, the close had
 * begun -- the card faded out and dropped off the screen -- before it was
 * taken back (the flicker audit, 2026-11-14, FL-3).
 */
describe("letGo", () => {
  const go = (point: Parameters<typeof letGo>[0], s: Partial<Parameters<typeof letGo>[2]> = {}) => {
    const details = { cancel: vi.fn() };
    const ask = vi.fn();
    letGo(point, details, { fromBottom: true, at: "half", ask, park: "peek", ...s });
    return { cancel: details.cancel, ask };
  };

  it("refuses a swipe past the pill at its source, and parks the card at the pill", () => {
    const { cancel, ask } = go(null);
    expect(cancel).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledWith("peek");
  });

  it("refuses it at the pill too, where it stays", () => {
    const { cancel, ask } = go(null, { at: "peek" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });

  it("lets a settings card at half close on it, the Drawer's own close", () => {
    const close = vi.fn();
    const { cancel } = go(null, { close, park: "half" });
    expect(cancel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("asks for the size of the snap point the Drawer picked", () => {
    expect(go("23rem", { at: "peek" }).ask).toHaveBeenCalledWith("half");
    expect(go(1).ask).toHaveBeenCalledWith("full");
    expect(go("23rem").ask).not.toHaveBeenCalled();
    // A settings card is parked at half, not the pill; one at half closes going lower.
    expect(go("4.25rem", { at: "full", park: "half" }).ask).toHaveBeenCalledWith("half");
    const close = vi.fn();
    go("4.25rem", { close, park: "half" });
    expect(close).toHaveBeenCalledOnce();
  });
});
