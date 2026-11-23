// @vitest-environment jsdom
/**
 * The fuel gauge is a meter a screen reader hears, its gallons as its
 * value, where it was a picture and a number; with no tanks' size, the
 * gallons alone, no meter.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { FuelGauge } from "./FuelGauge";

afterEach(cleanup);

test("a gauge is a meter of the gallons over the usable fuel", () => {
  render(<FuelGauge gal={23.6} usable={40} />);
  const meter = screen.getByRole("meter", { name: "Fuel in the tanks" });
  expect(meter.getAttribute("aria-valuenow")).toBe("23.6");
  expect(meter.getAttribute("aria-valuemax")).toBe("40");
  expect(meter.getAttribute("aria-valuetext")).toBe("23 gal");
});

test("more than the tanks hold reads as full, no more", () => {
  render(<FuelGauge gal={60} usable={40} />);
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("40");
});

test("without the tanks' size, the gallons alone", () => {
  render(<FuelGauge gal={12} usable={null} />);
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.getByText(/12 gal/)).toBeTruthy();
});

test("past empty, the gallons short with a minus and the gauge at empty", () => {
  render(<FuelGauge gal={-11.5} usable={40} tone="low" />);
  const meter = screen.getByRole("meter");
  expect(meter.getAttribute("aria-valuenow")).toBe("0");
  expect(meter.getAttribute("aria-valuetext")).toBe("\u221212 gal");
});
