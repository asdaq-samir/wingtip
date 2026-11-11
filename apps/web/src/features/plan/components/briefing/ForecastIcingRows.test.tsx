// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { IcingForecast, Leg } from "../../../../lib/api/types";
import type { FlightBriefing } from "../../hooks/useFlightBriefing";
import ForecastIcingRows from "./ForecastIcingRows";

afterEach(cleanup);

// The engine's answer for a two-leg route (icing_forecast_route): light on
// part of leg 1, leg 2 not had.
const FOUND: IcingForecast = {
  legs: [
    { index: 0, altitude_ft: 8000, severity: "light", share: 0.4, layer: { bottom_ft: 5000, top_ft: 11000 }, valid_s: 1794195000 },
    { index: 1, altitude_ft: 9000, severity: null, share: null, layer: null, valid_s: null },
  ],
  worst: { severity: "light", altitudes_ft: [8000], legs: [0] },
  unchecked: [1],
  line: "Forecast icing, light, at 8,000 ft on leg 1",
  issued: "2026-11-08T14:00:00Z",
};
const LEGS = [
  { from: "KORD", to: "KMSN" },
  { from: "KMSN", to: "KMSP" },
] as Leg[];

const vm = (ifr: boolean, icingForecast: Partial<FlightBriefing["icingForecast"]>) =>
  ({ ifr, icingForecast: { data: undefined, isError: false, isFetching: false, ...icingForecast } }) as unknown as FlightBriefing;

describe("the forecast icing in Adverse Conditions", () => {
  test("a row a leg: the severity at its altitude, the share of it, and the layer", () => {
    render(<ForecastIcingRows vm={vm(true, { data: FOUND })} legs={LEGS} />);
    const rows = screen.getAllByTestId("icing-forecast-leg");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("KORD → KMSN");
    expect(rows[0]!.textContent).toContain("Light at 8,000 ft, 40% of it");
    expect(rows[0]!.textContent).toContain("Icing forecast 5,000–11,000 ft");
    expect(rows[1]!.textContent).toContain("No forecast at 9,000 ft");
  });

  test("is not shown under VFR, and says so where it could not be checked", () => {
    const { container } = render(<ForecastIcingRows vm={vm(false, { data: FOUND })} legs={LEGS} />);
    expect(container.textContent).toBe("");
    render(<ForecastIcingRows vm={vm(true, { isError: true })} legs={LEGS} />);
    expect(screen.getByTestId("icing-forecast-unchecked").textContent).toContain("could not be checked");
  });
});
