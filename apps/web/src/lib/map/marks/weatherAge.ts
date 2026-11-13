import { useSaved } from "../../fromCache";
import { ago } from "../../format/time";
import { useMinuteClock } from "../../useMinuteClock";
import { useMapCredit } from "../gl/creditStore";

/**
 * The airport weather marks' age, said in the map's small print when they
 * are old: a METAR is issued every hour (AC 00-45H), and the marks kept
 * from before a lost connection were drawn as if current, their age only
 * in the Map menu (the offline audit's gap 7). Past STALE_MS the map
 * says "Field weather 45m old" until a fresh answer comes: a warning on the
 * map itself while it applies (WeatherAgeBanner), and a row in Status.
 */

/** Its key among the map's credits (creditStore). */
export const WEATHER_AGE = "field-weather-age";

/** When the marks' weather is old enough to say: half an hour, half a
 *  METAR's hour. */
const STALE_MS = 30 * 60_000;

/** The words for weather fetched at `fetchedAt`, now; null while fresh. */
export function weatherAgeWords(fetchedAt: number | null, now: number): string | null {
  if (fetchedAt == null || !Number.isFinite(fetchedAt) || now - fetchedAt < STALE_MS) return null;
  return `Field weather ${ago(now - fetchedAt).replace(/ ago$/, " old")}`;
}

/** The marks' age in the credits: from when the network gave the answer
 *  (the worker's mark, lib/fromCache), else when the page got it. */
export function useWeatherAgeCredit(path: string, updatedAt: number) {
  const now = useMinuteClock();
  const savedAt = useSaved((s) => s.saved[path]);
  useMapCredit(WEATHER_AGE, weatherAgeWords(savedAt ?? (updatedAt || null), now));
}
