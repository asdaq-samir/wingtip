import { useSaved } from "../../fromCache";
import { liveAge } from "../../kept/liveAge";
import { useMinuteClock } from "../../useMinuteClock";
import { useMapCredit } from "../gl/creditStore";

/**
 * The airport weather marks' age, said in the map's small print when they
 * are old: a METAR is issued every hour (AC 00-45H), and the marks kept
 * from before a lost connection were drawn as if current, their age only
 * in the Map menu (the offline audit's gap 7). Once the engine says a METAR
 * fetched then is no longer in force (weather_in_force: its hour, the
 * routine report's interval, AIM 7-1-28) the map says "Field weather 1h 5m
 * old" until a fresh answer comes: a warning on the
 * map itself while it applies (WeatherAgeBanner), and a row in Status.
 */

/** Its key among the map's credits (creditStore). */
export const WEATHER_AGE = "field-weather-age";

/** The words for weather fetched at `fetchedAt`, now; null while the
 *  engine holds it in force (lib/kept/liveAge), or its time not known. */
export function weatherAgeWords(fetchedAt: number | null, now: number): string | null {
  const age = liveAge({ product: "metar" }, fetchedAt, now);
  return age?.stale ? `Field weather ${age.words} old` : null;
}

/** The marks' age in the credits: from when the network gave the answer
 *  (the worker's mark, lib/fromCache), else when the page got it. */
export function useWeatherAgeCredit(path: string, updatedAt: number) {
  const now = useMinuteClock();
  const savedAt = useSaved((s) => s.saved[path]);
  useMapCredit(WEATHER_AGE, weatherAgeWords(savedAt ?? (updatedAt || null), now));
}
