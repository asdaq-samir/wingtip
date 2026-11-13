import { describe, expect, it } from "vitest";
import { airportWeatherDrawn, migrateAirportWeather } from "./airportWeatherPrefs";

describe("Settings' Airport Weather", () => {
  it("draws the ring alone, the ring with its wind, or the station model", () => {
    expect(airportWeatherDrawn("category")).toEqual({ look: "halo", stationClose: false, windArrows: false });
    expect(airportWeatherDrawn("wind")).toEqual({ look: "halo", stationClose: true, windArrows: true });
    expect(airportWeatherDrawn("station")).toMatchObject({ look: "station" });
  });

  it("brings a device's kept look and switches to one of the three", () => {
    expect(migrateAirportWeather({ look: "halo", stationClose: true, windArrows: true, worseByArrival: true }, 0)).toEqual({ show: "wind" });
    expect(migrateAirportWeather({ look: "halo", windArrows: false }, 0)).toEqual({ show: "category" });
    expect(migrateAirportWeather({ look: "station", windArrows: false }, 0)).toEqual({ show: "station" });
    expect(migrateAirportWeather({ look: "dot" }, 0)).toEqual({ show: "category" });
    expect(migrateAirportWeather({ look: "off" }, 0)).toEqual({ show: "category" });
    expect(migrateAirportWeather(undefined, 0)).toEqual({ show: "wind" });
    expect(migrateAirportWeather({ show: "station" }, 1)).toEqual({ show: "station" });
  });
});
