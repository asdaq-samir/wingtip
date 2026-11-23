// @vitest-environment jsdom
/**
 * A held point's card says Special VFR for the Class B, C or D surface
 * area it is in, as the airspace volume's card does: the band's class and
 * its primary airport (the planner's `ident`) asked of the engine, which
 * tests 91.157 and part 91 appendix D itself (special_vfr.rs). Here, that
 * the right band reaches it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { AirspaceBand } from "../../lib/api/types";
import { BandSpecialVfr } from "./BandSpecialVfr";

const band = (cls: AirspaceBand["class"], floor: number, ident: string | null = null): AirspaceBand => ({
  class: cls,
  floor_ft: floor,
  ceiling_ft: floor + 2500,
  ident,
  entry: "",
});

afterEach(cleanup);

describe("BandSpecialVfr", () => {
  test("offers it in a Class D surface area", () => {
    render(<BandSpecialVfr bands={[band("D", 0, "DPA"), band("E", 3200)]} ground={758} />);
    expect(screen.getByTestId("point-special-vfr").textContent).toContain("Special VFR");
    expect(screen.getByText("An ATC clearance")).toBeTruthy();
  });

  test("says none at an appendix D airport", () => {
    render(<BandSpecialVfr bands={[band("B", 0, "ORD")]} ground={680} />);
    expect(screen.getByTestId("point-special-vfr").textContent).toContain("No special VFR");
  });

  test("says nothing above a surface area or with the ground unknown", () => {
    render(<BandSpecialVfr bands={[band("G", 0), band("C", 1800, "MSN")]} ground={860} />);
    render(<BandSpecialVfr bands={[band("D", 0, "DPA")]} ground={null} />);
    expect(screen.queryByTestId("point-special-vfr")).toBeNull();
  });
});
