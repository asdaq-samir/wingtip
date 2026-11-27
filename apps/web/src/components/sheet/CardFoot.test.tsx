// @vitest-environment jsdom
/**
 * A card's tab bar on a phone's bottom sheet stands in the card's foot
 * slot, outside the sliding cards (sheet/CardFoot), so nothing in it is
 * moved against the card's slide; elsewhere it stays in the card. The
 * slot's height is the card's room under it.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { CardId } from "../../lib/sheetCards";
import { CardFootSlot, InCardFoot } from "./CardFoot";
import { cardFeetHost, inCardFoot, putCardFoot, useCardFeet, useCardFootHeight } from "./cardFeet";
import { useCardScrollRoom } from "./cardScrollRoom";
import { usePopupStill } from "./sheetMotion";

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

test("the slot's height is the card's end room and scroll padding under the bar", () => {
  function Scroller({ footPx }: { footPx: number }) {
    const [node, setNode] = useState<HTMLElement | null>(null);
    useCardScrollRoom(node, footPx);
    return <div ref={setNode} data-testid="scroller" />;
  }
  function Room() {
    return <span data-testid="room">{useCardFootHeight("kosh")}</span>;
  }
  const both = (footPx: number) => (
    <>
      <Scroller footPx={footPx} />
      <Room />
    </>
  );
  const { rerender } = render(both(0));
  expect(screen.getByTestId("room").textContent).toBe("0");
  act(() => putCardFoot("kosh", { el: document.createElement("div"), shown: true, height: 76 }));
  expect(screen.getByTestId("room").textContent).toBe("76");
  rerender(both(76));
  expect(screen.getByTestId("scroller").style.getPropertyValue("scroll-padding-bottom")).toBe("76px");
  rerender(both(0));
  expect(screen.getByTestId("scroller").style.getPropertyValue("scroll-padding-bottom")).toBe("");
});

test("the slot's last height is kept while it is out of sight, so the card's end room holds through a drag", () => {
  act(() => putCardFoot("kosh", { el: document.createElement("div"), shown: true, height: 76 }));
  function Room() {
    return <span data-testid="room">{useCardFootHeight("kosh")}</span>;
  }
  render(
    <>
      <Card shown={false} />
      <Room />
    </>,
  );
  expect(screen.queryByTestId("bar")).toBeNull();
  expect(screen.getByTestId("room").textContent).toBe("76");
});

test("the bar waits for its card to come to rest: not while it slides or a finger has it", async () => {
  const popup = document.createElement("div");
  const frames = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const slide = (type: string) => {
    const event = new Event(type) as TransitionEvent;
    Object.defineProperty(event, "propertyName", { value: "transform" });
    act(() => popup.dispatchEvent(event));
  };
  const { result } = renderHook(() => usePopupStill(popup, true));
  slide("transitionrun");
  await frames();
  expect(result.current).toBe(false);
  slide("transitionend");
  await frames();
  await frames();
  expect(result.current).toBe(true);
  await act(async () => {
    popup.setAttribute("data-swiping", "");
    await Promise.resolve();
  });
  expect(result.current).toBe(false);
});
