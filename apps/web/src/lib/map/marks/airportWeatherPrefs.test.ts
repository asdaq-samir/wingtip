import { describe, expect, it } from "vitest";
import { airportWeatherDrawn } from "./airportWeatherPrefs";

describe("Settings' Airport Weather", () => {
  it("draws nothing, the ring alone, the ring with its wind, or the station model", () => {
    expect(airportWeatherDrawn("off")).toEqual({ look: "off", stationClose: false, windArrows: false });
    expect(airportWeatherDrawn("category")).toEqual({ look: "halo", stationClose: false, windArrows: false });
    expect(airportWeatherDrawn("wind")).toEqual({ look: "halo", stationClose: true, windArrows: true });
    expect(airportWeatherDrawn("station")).toMatchObject({ look: "station" });
  });
});
