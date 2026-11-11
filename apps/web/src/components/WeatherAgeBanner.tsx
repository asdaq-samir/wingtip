import { Clock } from "lucide-react";
import { cn } from "cn";
import { Alert } from "./ui/alert";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";
import { useCredits } from "../lib/map/gl/creditStore";
import { WEATHER_AGE } from "../lib/map/marks/weatherAge";

/**
 * The airport weather marks' age on the map while they are old -- "Field
 * weather 45m old" (lib/map/marks/weatherAge: past half a METAR's hour,
 * AC 00-45H) -- in the map's banners' column (MapBanners), the stock Alert
 * on the map buttons' glass as ProblemBanner is. It is safety-relevant: a
 * field's colour drawn from an old report reads as the weather now, so it
 * is not small print and not only in Status (claude/sheet-native had moved
 * it there with the credits; the owner's lead put it back, 2026-11-11).
 * It goes as soon as a fresh answer comes.
 */
export default function WeatherAgeBanner() {
  const words = useCredits((s) => s.credits[WEATHER_AGE]);
  if (!words) return null;
  return (
    <div className={cn(GLASS, "appear pointer-events-auto w-fit max-w-full rounded-(--radius-banner)")}>
      <Alert
        role="status"
        data-testid="weather-age-banner"
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-(--radius-banner) border-transparent bg-transparent py-1 pr-3 pl-3 font-medium *:[svg]:translate-y-0",
          TEXT.detail,
        )}
      >
        <Clock className="shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{words}</span>
      </Alert>
    </div>
  );
}
