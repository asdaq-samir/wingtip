// @vitest-environment jsdom
/**
 * On a phone the fuel is set in a card over FPL (SheetCard, the stock
 * Drawer's nested drawer), not a sheet of its own that took FPL off the
 * screen (the HIG review, 2026-11-21): Cancel and Done in its head, Done
 * submitting the form inside it. The card stack itself is SheetCard's
 * (CardStack.test); here it is drawn in place.
 */
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FuelSet } from "./FuelSet";

vi.mock("../../hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("../../components/SheetCard", () => ({
  SheetCard: ({
    title,
    leading,
    action,
    children,
    testId,
  }: {
    title: string;
    leading: ReactNode;
    action: ReactNode;
    children: ReactNode;
    testId: string;
  }) => (
    <div data-testid={testId}>
      <div>
        {leading}
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  ),
}));

afterEach(cleanup);

test("the gauge opens a card with Cancel and Done, and Done sets the gallons", () => {
  const onSet = vi.fn();
  render(<FuelSet tank={{ gal: 36.4, usable: 40, low: false, own: null }} ident="KOSH" stop={false} onSet={onSet} />);
  expect(screen.queryByTestId("fuel-set")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "36 gal, fuel on board: change" }));
  expect(screen.getByTestId("fuel-set")).toBeTruthy();
  const field = screen.getByRole("textbox", { name: /Fuel on board at KOSH, gallons/ });
  fireEvent.change(field, { target: { value: "20" } });
  fireEvent.blur(field);
  fireEvent.click(screen.getByTestId("fuel-set-done"));
  expect(onSet).toHaveBeenCalledWith(20);
  expect(screen.queryByTestId("fuel-set")).toBeNull();
});

test("Cancel puts the card away and sets nothing", () => {
  const onSet = vi.fn();
  render(<FuelSet tank={{ gal: 13.6, usable: 40, low: false, own: null }} ident="KJVL" stop onSet={onSet} />);
  fireEvent.click(screen.getByRole("button", { name: "13 gal, fuel at KJVL: change" }));
  fireEvent.click(screen.getByTestId("fuel-set-cancel"));
  expect(screen.queryByTestId("fuel-set")).toBeNull();
  expect(onSet).not.toHaveBeenCalled();
});
