// @vitest-environment jsdom
/**
 * The Brief's En Route row says "None" for the ceiling only where the
 * forecast along the route was read and gave none; with no forecast it is
 * a dash, never clear skies nothing had said.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { BriefGlance } from "./glance";
import { EnrouteRow } from "./glanceRows";

afterEach(cleanup);

const enroute = (ceilingFt: number | null, visibilitySm: number | null): BriefGlance["enroute"] => ({
  ceilingFt,
  visibilitySm,
  wind: null,
  eteMin: null,
  line: null,
  finding: "ok",
});

const ceiling = () => screen.getByTestId("brief-glance-enroute").textContent ?? "";

test("no forecast yet, or none to read: the ceiling is a dash, not None", () => {
  render(<EnrouteRow said={false} onOpen={() => {}} />);
  expect(ceiling()).not.toContain("None");
  cleanup();
  render(<EnrouteRow enroute={enroute(null, null)} said={false} onOpen={() => {}} />);
  expect(ceiling()).not.toContain("None");
});

test("a forecast with no ceiling in it says None; one with a ceiling says its feet", () => {
  render(<EnrouteRow enroute={enroute(null, 6)} said={false} onOpen={() => {}} />);
  expect(ceiling()).toContain("None");
  cleanup();
  render(<EnrouteRow enroute={enroute(2500, 6)} said={false} onOpen={() => {}} />);
  expect(ceiling()).toContain("2,500 ft");
});
