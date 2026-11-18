// @vitest-environment jsdom
/**
 * The airport card's second line says what kind of field it is where it is
 * not an airport (the owner, 2026-11-18): a heliport's and a seaplane
 * base's site badge, the planner's `site_type` (the engine's words for
 * NASR's SITE_TYPE_CODE), beside the use badge where it has one; none for
 * an airport.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AirportPlace } from "../../lib/api/types";
import { PlaceSubtitle } from "./PlaceSubtitle";

// No NOTAM's badge on the line: what is tested is the status line.
vi.mock("./notamBadges", () => ({
  useNotamMarks: () => ({ field: null }),
  useNotamSheet: () => ({ shown: null, show: () => {}, close: () => {} }),
}));

// FitLine watches the name's width; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const FIELD = {
  ident: "IL72",
  name: "Advocate Condell Medical Center",
  closed: null,
  private: false,
  site_type: null,
} as unknown as AirportPlace;

const line = (place: AirportPlace, kind: string | null = null) =>
  render(<PlaceSubtitle ident={place.ident} place={place} name={place.name} kind={kind} tower="Non-towered" />);

afterEach(cleanup);

describe("PlaceSubtitle", () => {
  test("a heliport's line says Heliport beside its use", () => {
    line({ ...FIELD, private: true, site_type: "Heliport" }, "Private: permission required");
    const badges = [...screen.getByTestId("place-status").children].map((b) => b.textContent);
    expect(badges).toEqual(["Private: permission required", "Heliport"]);
    expect(screen.getByTestId("place-site").dataset.status).toBe("site");
  });

  test("a public seaplane base's line says Seaplane base alone", () => {
    line({ ...FIELD, ident: "LOT", site_type: "Seaplane base" });
    expect(screen.getByTestId("place-site").textContent).toBe("Seaplane base");
    expect(screen.queryByTestId("place-kind")).toBeNull();
  });

  test("an airport's line has no site badge", () => {
    line({ ...FIELD, ident: "KMSN", name: "Dane County Regional" });
    expect(screen.queryByTestId("place-status")).toBeNull();
  });
});
