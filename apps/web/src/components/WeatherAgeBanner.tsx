import { Clock } from "lucide-react";
import MapBanner from "./MapBanner";
import { useCredits } from "../lib/map/gl/creditStore";
import { WEATHER_AGE } from "../lib/map/marks/weatherAge";

/**
 * The airport weather marks' age on the map while they are old -- "Field
 * weather 45m old" (lib/map/marks/weatherAge: past half a METAR's hour,
 * AC 00-45H) -- in the map's banners' column (MapBanners), the map's one
 * banner (MapBanner). It is safety-relevant: a field's colour drawn from
 * an old report reads as the weather now, so it is not small print and
 * not only in Status (claude/sheet-native had moved it there with the
 * credits; the owner's lead put it back, 2026-11-11). It goes as soon as
 * a fresh answer comes.
 */
export default function WeatherAgeBanner() {
  const words = useCredits((s) => s.credits[WEATHER_AGE]);
  if (!words) return null;
  return <MapBanner data-testid="weather-age-banner" className="appear" icon={Clock} title={words} />;
}
