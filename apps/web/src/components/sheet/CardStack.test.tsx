// @vitest-environment jsdom
/**
 * The sheet hears how many cards are up over it from the stock Drawer's
 * own nesting (data-nested-drawer-open on its popup, what fades its
 * content and hands its swipe to the card). Base UI sets a parent's count
 * from its child, not adds to it, so two cards drawn side by side in the
 * sheet left it with the last one's word: one closed over another, the
 * sheet thought none was up. Nested one in another (CardStack), the sheet
 * hears the one under them all.
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
