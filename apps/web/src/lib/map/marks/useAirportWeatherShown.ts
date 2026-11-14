import { usePreferences } from "../../preferences";
import { useAirportWeatherPrefs, type AirportWeather } from "./airportWeatherPrefs";

/** The fields' weather marks the map draws: Settings' Airport Weather,
 *  while the Map card's Weather is on, and Off while it is off (the owner,
 *  2026-11-14: the four layers). Its own file, as the preferences' own
 *  migration reads airportWeatherPrefs. */
export function useAirportWeatherShown(): AirportWeather {
  const weather = usePreferences((s) => s.weather);
  const show = useAirportWeatherPrefs((s) => s.show);
  return weather ? show : "off";
}
