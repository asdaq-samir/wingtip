// @vitest-environment jsdom
/**
 * The sheet hears how many cards are up over it from the stock Drawer's
 * own nesting (data-nested-drawer-open on its popup, what fades its
 * content and hands its swipe to the card). Base UI sets a parent's count
 * from its child, not adds to it, so two cards drawn side by side in the
 * sheet left it with the last one's word: one closed over another, the
 * sheet thought none was up. Their own Drawer, open while any card is
 * (CardStack's Cards), is what the sheet hears. And each card's drawer
 * keeps one place in React's tree for its life, so none is drawn anew as
 * the others open, close, are kept or raised (the flicker audit,
 * 2026-11-14, FL-1 and FL-2).
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Drawer } from "@base-ui/react/drawer";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { useSheetCards, type CardEntry } from "../../lib/sheetCards";
import { CardStack } from "./CardStack";

const card = (id: string): CardEntry => ({
  id,
  at: "half",
  state: "open",
  frame: { testId: id },
  slot: null,
  host: document.createElement("div"),
});

function Sheet() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <Drawer.Root open modal={false}>
      {/* In its Viewport, as the app's sheet is (SheetDrawer): Base UI says so where it is not. */}
      <Drawer.Portal>
        <Drawer.Viewport>
          <Drawer.Popup data-testid="sheet">
            <div ref={setHost} />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
      <CardStack host={host} onPhone={false} fromBottom ready grabber={() => null} look="" below="" />
    </Drawer.Root>
  );
}

const cardUp = () => screen.getByTestId("sheet").hasAttribute("data-nested-drawer-open");

afterEach(() => {
  cleanup();
  useSheetCards.setState({ stack: [] });
});

test("a card closed over another leaves the sheet knowing the one under it is still up", async () => {
  render(<Sheet />);
  act(() => useSheetCards.setState({ stack: [card("airport"), card("notam")] }));
  await waitFor(() => expect(cardUp()).toBe(true));

  // The NOTAM's card put away: the airport's is still up over the sheet.
  act(() => useSheetCards.setState((s) => ({ stack: s.stack.map((e) => (e.id === "notam" ? { ...e, state: "kept" } : e)) })));
  await waitFor(() => expect(screen.getByTestId("notam")).toHaveProperty("hidden", true));
  expect(cardUp()).toBe(true);

  // Both gone: the sheet is the one in sight again.
  act(() => useSheetCards.setState((s) => ({ stack: s.stack.map((e) => ({ ...e, state: "kept" as const })) })));
  await waitFor(() => expect(cardUp()).toBe(false));
});

const kept = (id: string) => (e: CardEntry) => (e.id === id ? { ...e, state: "kept" as const } : e);

test("a card's drawer is never drawn anew as the cards around it open, close, are kept and raised", async () => {
  render(<Sheet />);
  act(() => useSheetCards.setState({ stack: [card("airport"), card("notam")] }));
  await waitFor(() => expect(cardUp()).toBe(true));
  const airport = screen.getByTestId("airport");
  const notam = screen.getByTestId("notam");

  // The one under put away (kept): the one over it is the same drawer.
  act(() => useSheetCards.setState((s) => ({ stack: s.stack.map(kept("airport")) })));
  await waitFor(() => expect(screen.getByTestId("airport")).toHaveProperty("hidden", true));
  expect(screen.getByTestId("notam")).toBe(notam);
  expect(cardUp()).toBe(true);

  // Opened again and raised over it: both the same drawers, the raised one drawn over.
  act(() =>
    useSheetCards.setState((s) => ({
      stack: [...s.stack.filter((e) => e.id !== "airport"), { ...card("airport"), state: "open" as const }],
    })),
  );
  await waitFor(() => expect(screen.getByTestId("airport")).toHaveProperty("hidden", false));
  expect(screen.getByTestId("airport")).toBe(airport);
  expect(screen.getByTestId("notam")).toBe(notam);

  // A third over them, then the one under all of them leaving: still the same.
  act(() => useSheetCards.setState((s) => ({ stack: [...s.stack, card("traffic")] })));
  const traffic = await screen.findByTestId("traffic");
  act(() => useSheetCards.setState((s) => ({ stack: s.stack.map((e) => (e.id === "notam" ? { ...e, state: "leaving" as const } : e)) })));
  await waitFor(() => expect(screen.queryByTestId("notam")).toBeNull());
  expect(screen.getByTestId("airport")).toBe(airport);
  expect(screen.getByTestId("traffic")).toBe(traffic);
  expect(cardUp()).toBe(true);
});
