// @vitest-environment jsdom
/**
 * Escape in Setup's layer goes back to the map, except while a menu or a
 * list opened from a control in it still has the focus on its trigger:
 * that key is the menu's (consoles.spec's role menu closed the whole
 * console when Escape came before the menu took the focus).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ConsoleLayer from "./ConsoleLayer";

afterEach(cleanup);

function setup(trigger: Record<string, string>) {
  const onClose = vi.fn();
  render(
    <ConsoleLayer label="Pilot" detent="large" edge="bottom" onClose={onClose} shown>
      <button type="button" data-testid="control" {...trigger}>
        Pilot
      </button>
    </ConsoleLayer>,
  );
  return { onClose, control: screen.getByTestId("control") };
}

test("Escape on a control in the layer puts the console away", () => {
  const { onClose, control } = setup({});
  fireEvent.keyDown(control, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Escape on a menu's trigger whose menu is open is left to the menu", () => {
  const { onClose, control } = setup({ "aria-haspopup": "menu", "aria-expanded": "true" });
  fireEvent.keyDown(control, { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
});

test("Escape on a menu's trigger whose menu is closed puts the console away", () => {
  const { onClose, control } = setup({ "aria-haspopup": "menu", "aria-expanded": "false" });
  fireEvent.keyDown(control, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});
