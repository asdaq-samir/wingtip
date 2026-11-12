import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How a field's weather is drawn on the map (the owner's pick,
 *  2026-11-10): not at all, a ring in its flight category's colour round
 *  the chart's own symbol (the default), ForeFlight's filled dot in place
 *  of the symbol, or the station model wherever it fits. */
export type AirportWeatherLook = "off" | "halo" | "dot" | "station";

export const AIRPORT_WEATHER_LOOKS: { value: AirportWeatherLook; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "halo", label: "Halo" },
  { value: "dot", label: "Dot" },
  { value: "station", label: "Station" },
];

/**
 * The Map card's "Airport weather" (components/AirportWeatherSettings):
 * the look, and three switches, all on unless turned off -- the station
 * model when zoomed in close, the wind barbs farther out (windArrows, its
 * name kept so a device keeps its choice), and the getting-worse badge
 * at the plan's fields. Kept on this device, as the map's other weather
 * settings are (lib/map/sources/weatherLayers).
 */
interface AirportWeatherPrefs {
  look: AirportWeatherLook;
  stationClose: boolean;
  windArrows: boolean;
  worseByArrival: boolean;
  set: (patch: Partial<Omit<AirportWeatherPrefs, "set">>) => void;
}

export const useAirportWeatherPrefs = create<AirportWeatherPrefs>()(
  persist((set) => ({ look: "halo", stationClose: true, windArrows: true, worseByArrival: true, set: (patch) => set(patch) }), {
    name: "wingtip.airportWeather",
    partialize: ({ set: _set, ...kept }) => kept,
  }),
);
