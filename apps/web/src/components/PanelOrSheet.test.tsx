// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PanelOrSheet from "./PanelOrSheet";
import { SheetCardHost } from "./SheetCard";
import { useSheetCards } from "../lib/sheetCards";

/** A window as wide as `width`: useIsMobile's query answers by it. */
function windowOf(width: number) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: /max-width: (\d+)px/.test(query) ? width <= Number(/max-width: (\d+)px/.exec(query)![1]) : false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function screenOf(onClose = vi.fn()) {
  render(
    <>
      <SheetCardHost shown />
      <PanelOrSheet open onClose={onClose} name="Emergency" title={<span>Emergency</span>} raise="full" testId="emergency-sheet">
        <p>7700</p>
      </PanelOrSheet>
    </>,
  );
  return onClose;
}

describe("a screen that keeps the map usable", () => {
  beforeEach(() => useSheetCards.setState({ host: null, stack: [] }));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("from md up it is a region in the side panel, no modal, the panel all the way up for it", async () => {
    windowOf(1280);
    const onClose = screenOf();
    const card = await screen.findByTestId("emergency-sheet");
    expect(card.getAttribute("role")).toBe("region");
    expect(card.closest("[data-sheet-cards]")).not.toBeNull();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(useSheetCards.getState().stack.map((e) => e.raise)).toEqual(["full"]);
    expect(card.textContent).toContain("7700");
    await act(async () => fireEvent.click(screen.getByTestId("sheet-card-close")));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("on a phone it is the stock sheet, as it was", async () => {
    windowOf(390);
    screenOf();
    const sheet = await screen.findByTestId("emergency-sheet");
    expect(sheet.closest("[data-sheet-cards]")).toBeNull();
    expect(sheet.getAttribute("role")).toBe("dialog");
  });
});
