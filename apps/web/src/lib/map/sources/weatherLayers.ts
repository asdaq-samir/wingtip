import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The winds aloft's altitude on the map: the plan's cruise, or one of
 *  the FD product's own (FAA-H-8083-28B 27.2.1.1.1: 3,000 to 39,000 ft), or none. */
export type WindsAt = "off" | "plan" | 3000 | 6000 | 9000 | 12000 | 18000;

/** The radar and satellite loop (features/weather-loop): off, the radar,
 *  the GOES infrared or visible picture, or the radar over the infrared
 *  (the owner's five, 2026-11-09). */
export type LoopKind = "off" | "radar" | "ir" | "visible" | "both";

/** The flow layer's field (features/weather-flow): the wind's streaks
 *  over a colour field of the model's wind, gusts, precipitation, cloud,
 *  temperature or visibility, Windy's and Apple Weather's map (the owner,
 *  2026-11-11), or off -- off by default, so it never fights the chart. */
export type FlowField = "off" | "wind" | "gust" | "precip" | "cloud" | "temp" | "vis";

/** How fast the loop plays: a menu, as a discrete setting is (the owner,
 *  2026-09-30), not a slider. */
export type LoopSpeed = "slow" | "normal" | "fast";

/**
 * Which weather the map draws, at the owner's pick (the canvas's map
 * weather, A: the map's own button, 2026-10-20), each the pilot's to turn
 * on or off and kept on this device. All off until asked for: a SIGMET or
 * a G-AIRMET is hundreds of miles across, and drawn by default it took
 * the tap meant for the airport, the airspace or the chart under it (CI's
 * run 42198681351: places, classb, airspace-lines and route-fit), as the
 * radar's tiles darkened every map before the pilot had asked for weather.
 * The radar and the satellite picture are one choice, the loop's, since
 * the loop replaced their two switches (2026-11-09).
 */
interface WeatherLayers {
  loop: LoopKind;
  loopSpeed: LoopSpeed;
  areas: boolean;
  pireps: boolean;
  winds: WindsAt;
  flow: FlowField;
  set: (patch: Partial<Omit<WeatherLayers, "set">>) => void;
}

export const useWeatherLayers = create<WeatherLayers>()(
  persist(
    (set) => ({ loop: "off", loopSpeed: "normal", areas: false, pireps: false, winds: "off", flow: "off", set: (patch) => set(patch) }),
    { name: "wingtip.weatherLayers", partialize: ({ set: _set, ...kept }) => kept },
  ),
);
