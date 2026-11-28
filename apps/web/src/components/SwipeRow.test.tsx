// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SwipeRow } from "./SwipeRow";

// A mouse (hover and a fine pointer) or a finger (any coarse pointer, as
// SwipeRow asks), and Reduce Motion on so the row's moves are made at
// once, with no frames to wait on.
const as = (mouse: boolean) => {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: query.includes("reduced-motion") || (mouse ? query.includes("hover") : query.includes("coarse")),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
};
const real = window.matchMedia;
afterEach(() => {
  window.matchMedia = real;
});

const row = (onRemove = vi.fn(), off = false) =>
  render(
    <SwipeRow word="Remove" label="Remove KDLH from Favorites" onRemove={onRemove} off={off}>
      <span>KDLH</span>
    </SwipeRow>,
  );

describe("SwipeRow", () => {
  it("is the row alone with a mouse: its menu removes it", () => {
    as(true);
    row();
    expect(screen.getByText("KDLH")).toBeTruthy();
    expect(screen.queryByTestId("swipe-remove")).toBeNull();
  });

  it("is the row alone in Edit", () => {
    as(false);
    row(vi.fn(), true);
    expect(screen.queryByTestId("swipe-remove")).toBeNull();
  });

  it("to a finger, keeps its Remove out of reach until swiped open", async () => {
    as(false);
    row();
    const remove = await screen.findByTestId("swipe-remove", undefined, { timeout: 5000 });
    // Inert behind the row: a keyboard and VoiceOver use the row's menu.
    expect(remove.closest("[inert]")).not.toBeNull();
    expect(remove.getAttribute("aria-label")).toBe("Remove KDLH from Favorites");
  });

  it("removes by the menu's own handler when its button is pressed", async () => {
    as(false);
    const onRemove = vi.fn();
    row(onRemove);
    const remove = await screen.findByTestId("swipe-remove", undefined, { timeout: 5000 });
    fireEvent.click(remove);
    await vi.waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
  });
});
