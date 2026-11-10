// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Totals } from "../../../../lib/api/types";
import { NavLogTotals } from "./NavLogTotals";

const totals = { distance_nm: 105.14, ete_min: 52.3, fuel_gal: 9.06 } as Totals;

function foot(columns: string[], t: Totals = totals) {
  render(
    <table>
      <NavLogTotals totals={t} columns={columns} />
    </table>,
  );
  return [...screen.getByTestId("navlog-totals").querySelectorAll("td")].map((td) => td.textContent);
}

describe("the nav log's totals on a desktop", () => {
  afterEach(cleanup);

  test("each under its column, the planner's own sums, nothing under the others", () => {
    expect(foot(["waypoint", "alt", "dist", "tc", "wind", "mh", "gs", "ete", "fuel"])).toEqual([
      "Total",
      "",
      "105.1",
      "",
      "",
      "",
      "",
      "52.3",
      "9.1",
    ]);
  });

  test("with no airplane the time and fuel columns are not there, and none is made up", () => {
    expect(foot(["waypoint", "alt", "dist", "tc", "wind"], { ...totals, ete_min: null, fuel_gal: null })).toEqual([
      "Total",
      "",
      "105.1",
      "",
      "",
    ]);
  });
});
