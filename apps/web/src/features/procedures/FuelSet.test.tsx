// @vitest-environment jsdom
/**
 * The fuel set from a field's gauge on FPL's timeline: the engine walks
 * the tanks from the pilot's own figure (fuel_in_tanks' fill_gal), and the
 * gauge is a button named with the gallons in sight.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { NavLogRow } from "../plan";
import { FuelSet } from "./FuelSet";
import { tanksAt } from "./routeTanks";

afterEach(cleanup);

const airport = (ident: string) => ({ ident, kind: "airport", lat: 0, lon: 0 }) as never;
const leg = (fuel_gal: number) => ({ fuel_gal }) as never;
const ROWS = [
  { kind: "departure", key: "departure", airport: airport("KOSH"), minutesFlown: 0 },
  { kind: "stop", key: "stop-0", airport: airport("KJVL"), leg: leg(10), minutesFlown: 60, groundMin: 30 },
  { kind: "destination", key: "destination", airport: airport("KMSN"), leg: leg(8), minutesFlown: 120 },
] as unknown as NavLogRow[];
const FUEL = { usableGal: 40, taxiGal: 1.4, reservesGal: [6] };

test("the tanks are walked from the pilot's own fuel at the start and at a stop", () => {
  const full = tanksAt(ROWS, FUEL);
  expect(full.get("departure")).toMatchObject({ gal: 40, own: null });
  // 25 at engine start, 10 burned: 13.6 on landing; none bought there, 8 more.
  const own = tanksAt(ROWS, FUEL, { KOSH: 25, KJVL: 0 });
  expect(own.get("departure")).toMatchObject({ gal: 25, own: 25, low: false });
  expect(own.get("stop-0")!.gal).toBeCloseTo(13.6);
  expect(own.get("stop-0")!.own).toBe(0);
  expect(own.get("destination")!.gal).toBeCloseTo(4.2);
  expect(own.get("destination")).toMatchObject({ low: true, own: null });
});

test("the gauge is a button named with its gallons, and Done sets the figure", () => {
  const onSet = vi.fn();
  render(<FuelSet tank={{ gal: 36.4, usable: 40, low: false, own: null }} ident="KOSH" stop={false} onSet={onSet} />);
  const button = screen.getByRole("button", { name: "36 gal, fuel on board: change" });
  fireEvent.click(button);
  const field = screen.getByRole("textbox", { name: /Fuel on board at KOSH, gallons/ });
  fireEvent.change(field, { target: { value: "50" } });
  fireEvent.blur(field);
  expect(screen.getByTestId("fuel-set-note").textContent).toBe("More than the 40 gal the tanks hold");
  fireEvent.click(screen.getByTestId("fuel-set-done"));
  expect(onSet).toHaveBeenCalledWith(50);
});

test("a stop's No fuel keeps what it lands with, Full goes back to full", () => {
  const onSet = vi.fn();
  render(<FuelSet tank={{ gal: 13.6, usable: 40, low: false, own: null }} ident="KJVL" stop onSet={onSet} />);
  fireEvent.click(screen.getByRole("button", { name: "13 gal, fuel at KJVL: change" }));
  fireEvent.click(screen.getByRole("button", { name: "No Fuel" }));
  fireEvent.click(screen.getByTestId("fuel-set-done"));
  expect(onSet).toHaveBeenLastCalledWith(0);
});

test("a stop's figure under what it lands with says it keeps that", () => {
  // The engine keeps what is left (tanks_leaving): 5 typed at a stop the
  // airplane lands at with 13.6 is said, not kept silently.
  render(<FuelSet tank={{ gal: 13.6, usable: 40, low: false, own: null }} ident="KJVL" stop onSet={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "13 gal, fuel at KJVL: change" }));
  const field = screen.getByRole("textbox", { name: /Fuel at KJVL, gallons/ });
  fireEvent.change(field, { target: { value: "5" } });
  fireEvent.blur(field);
  expect(screen.getByTestId("fuel-set-note").textContent).toBe("Keeps the 13 gal it lands with");
  fireEvent.change(field, { target: { value: "20" } });
  fireEvent.blur(field);
  expect(screen.getByTestId("fuel-set-note").textContent).toBe("Lands with 13 gal");
});

test("the departure is low with too little on board, the destination with the alternate's fuel", () => {
  // 7 on board, 1.4 taxi: 5.6 to fly, under the 6 gal reserve (14 CFR
  // 91.151(a)). Filled at KJVL, the destination lands with 40 - 1.4 - 8
  // = 30.6: over the reserve, under it and a 25 gal alternate leg
  // (91.167(a)(2)).
  expect(tanksAt(ROWS, FUEL, { KOSH: 7 }).get("departure")!.low).toBe(true);
  expect(tanksAt(ROWS, { ...FUEL, alternateGal: 25 }).get("destination")!.low).toBe(true);
  expect(tanksAt(ROWS, FUEL).get("destination")!.low).toBe(false);
});
