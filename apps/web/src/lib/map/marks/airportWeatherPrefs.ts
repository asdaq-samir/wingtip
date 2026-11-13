import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How a field's weather looks on the chart (glOverlays' airport weather
 *  state): a ring in its flight category's colour round the chart's own
 *  symbol, or the station model wherever it fits. */
export type AirportWeatherLook = "halo" | "station";

/** Settings' Airport Weather, one menu of three (the owner, 2026-11-13):
 *  the flight category's ring alone; the ring with the wind -- its barbs
 *  farther out and the station model zoomed in close; or the station
 *  model wherever it fits. Off and ForeFlight's Dot are gone, and the
 *  three switches that were under them. */
export type AirportWeather = "category" | "wind" | "station";

export const AIRPORT_WEATHER: { value: AirportWeather; label: string }[] = [
  { value: "category", label: "Flight Category" },
  { value: "wind", label: "With Wind" },
  { value: "station", label: "Station Model" },
];

/** What the map draws for each (AirportWeatherGl, AirportsGl): the look,
 *  the station model zoomed in close, the wind barbs farther out. The
 *  amber ↓ at a plan's field whose weather gets worse by the pilot's time
 *  there is drawn with every one: its switch went (the owner, 2026-11-13). */
export function airportWeatherDrawn(show: AirportWeather): { look: AirportWeatherLook; stationClose: boolean; windArrows: boolean } {
  if (show === "station") return { look: "station", stationClose: true, windArrows: true };
  return { look: "halo", stationClose: show === "wind", windArrows: show === "wind" };
}

/** What a device kept before the menu, brought to one of its three:
 *  the station model kept, the ring with its barbs With Wind, the rest --
 *  the ring alone, the dot, Off -- the flight category. */
export function migrateAirportWeather(kept: unknown, from: number): { show: AirportWeather } {
  const old = (kept ?? {}) as { look?: string; windArrows?: boolean; show?: AirportWeather };
  if (from >= 1 && old.show) return { show: old.show };
  if (old.look === "station") return { show: "station" };
  return { show: old.look === "halo" && old.windArrows !== false ? "wind" : "category" };
}

/** Kept on this device, as the map's other weather settings are
 *  (lib/map/sources/weatherLayers). With Wind, the look most pilots had:
 *  the ring with its barbs and the station model close in. */
export const useAirportWeatherPrefs = create<{ show: AirportWeather; set: (show: AirportWeather) => void }>()(
  persist((set) => ({ show: "wind", set: (show) => set({ show }) }), {
    name: "wingtip.airportWeather",
    // 1: the menu of three (2026-11-13), from the look and its switches.
    version: 1,
    migrate: migrateAirportWeather,
    partialize: ({ show }) => ({ show }),
  }),
);
