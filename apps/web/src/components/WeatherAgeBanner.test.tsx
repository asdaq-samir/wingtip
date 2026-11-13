// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import WeatherAgeBanner from "./WeatherAgeBanner";
import { useCredits } from "../lib/map/gl/creditStore";
import { WEATHER_AGE } from "../lib/map/marks/weatherAge";

afterEach(() => {
  cleanup();
  useCredits.setState({ credits: {} });
});

describe("WeatherAgeBanner", () => {
  it("says the field weather's age on the map while it is old, and goes when it is fresh", () => {
    render(<WeatherAgeBanner />);
    expect(screen.queryByTestId("weather-age-banner")).toBeNull();
    act(() => useCredits.setState({ credits: { [WEATHER_AGE]: "Field weather 45m old" } }));
    expect(screen.getByTestId("weather-age-banner").textContent).toBe("Field weather 45m old");
    act(() => useCredits.setState({ credits: {} }));
    expect(screen.queryByTestId("weather-age-banner")).toBeNull();
  });

  it("is not another layer's credit", () => {
    useCredits.setState({ credits: { traffic: "Traffic from adsb.lol" } });
    render(<WeatherAgeBanner />);
    expect(screen.queryByTestId("weather-age-banner")).toBeNull();
  });
});
