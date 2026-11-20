// @vitest-environment jsdom
/**
 * The app's pull-down is Base UI's Select (ui/select): its trigger says the
 * one picked with the pull-down's name, a tap a listbox of the choices,
 * the one picked selected, a pick handed to the caller; a caller's own
 * trigger is the Select's trigger as it is.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { PullDownSelect } from "./PullDownSelect";

beforeAll(() => {
  // Base UI wants these of a browser.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

const OPTIONS = [
  { value: "60", label: "1h", testId: "aloft-60" },
  { value: "120", label: "2h", testId: "aloft-120" },
];

describe("PullDownSelect", () => {
  test("its trigger says the one picked, a listbox opens on it, a pick goes to the caller", async () => {
    const onChange = vi.fn();
    render(<PullDownSelect label="Time aloft" value="60" options={OPTIONS} onChange={onChange} testId="aloft" />);
    const trigger = screen.getByTestId("aloft");
    expect(trigger.getAttribute("aria-label")).toBe("Time aloft: 1h");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    // Its words and the chevron, nothing else: Base UI's Select.Icon
    // brings a "▼" of its own, once held as text in the chevron's svg.
    expect(trigger.textContent).toBe("1h");
    fireEvent.click(trigger);
    const list = await screen.findByRole("listbox");
    expect(list.getAttribute("aria-label")).toBe("Time aloft");
    expect(screen.getByTestId("aloft-60").getAttribute("aria-selected")).toBe("true");
    // A press as a finger or a mouse makes it: Base UI takes a click on a
    // row only after its press began there.
    fireEvent.pointerDown(screen.getByTestId("aloft-120"));
    fireEvent.click(screen.getByTestId("aloft-120"));
    expect(onChange).toHaveBeenCalledWith("120");
  });

  test("a caller's own trigger is the Select's", () => {
    render(
      <PullDownSelect
        label="Add a Favorite"
        value=""
        options={OPTIONS}
        onChange={() => {}}
        trigger={<button type="button" data-testid="own" aria-label="Add a Favorite" />}
      />,
    );
    const own = screen.getByTestId("own");
    expect(own.getAttribute("aria-haspopup")).toBe("listbox");
    expect(own.getAttribute("aria-label")).toBe("Add a Favorite");
  });
});
