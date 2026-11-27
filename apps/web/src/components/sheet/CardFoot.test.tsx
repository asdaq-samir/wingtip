// @vitest-environment jsdom
/**
 * A card's tab bar on a phone's bottom sheet stands in the card's foot
 * slot, outside the sliding cards (sheet/CardFoot), so nothing in it is
 * moved against the card's slide; elsewhere it stays in the card.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CardId } from "../../lib/sheetCards";
import { CardFootSlot, InCardFoot } from "./CardFoot";
import { cardFeetHost, inCardFoot, useCardFeet } from "./cardFeet";

afterEach(() => {
  cleanup();
  useCardFeet.setState({ host: null, feet: {} });
});

function Card({ shown, slot = true }: { shown: boolean; slot?: boolean }) {
  return (
    <>
      <div data-testid="viewport">
        <div ref={cardFeetHost} />
      </div>
      {slot && <CardFootSlot id="kosh" shown={shown} />}
      <div data-testid="card">
        <CardId.Provider value="kosh">
          <InCardFoot inline={<span data-testid="bar">inline</span>}>
            <span data-testid="bar">slotted</span>
          </InCardFoot>
        </CardId.Provider>
      </div>
    </>
  );
}

test("with no slot (the side panel, a top sheet) the bar stays in the card", () => {
  render(<Card shown slot={false} />);
  expect(screen.getByTestId("card").contains(screen.getByTestId("bar"))).toBe(true);
  expect(screen.getByTestId("bar").textContent).toBe("inline");
});

test("on a phone's bottom sheet the bar is in the slot beside the sheet, not in the card, and gone at the pill", () => {
  const { rerender } = render(<Card shown />);
  const bar = screen.getByTestId("bar");
  expect(bar.textContent).toBe("slotted");
  expect(screen.getByTestId("card").contains(bar)).toBe(false);
  expect(screen.getByTestId("viewport").contains(bar)).toBe(true);
  // A tap on it is not a tap outside the card (CardStack's onOpenChange).
  expect(inCardFoot(bar)).toBe(true);
  expect(inCardFoot(screen.getByTestId("card"))).toBe(false);
  act(() => rerender(<Card shown={false} />));
  expect(screen.queryByTestId("bar")).toBeNull();
  expect(screen.getByTestId("viewport").querySelector("[data-card-foot]")?.hasAttribute("hidden")).toBe(true);
});
