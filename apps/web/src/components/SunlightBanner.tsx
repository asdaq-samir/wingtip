import { Sun } from "lucide-react";
import MapBanner, { BannerButton } from "./MapBanner";
import { unseen, useTips } from "../lib/firstRunTips";
import { usePreferences } from "../lib/preferences";
import { useSunlight, useSunlightSensor } from "../lib/sunlight";

/** The seen-once store's key for the banner (lib/firstRunTips), said once on this device. */
const SEEN = "sunlight-banner";

/**
 * The sunlight scheme's one line, the first time it comes on by itself
 * from the light sensor (lib/sunlight), the map's one banner (MapBanner),
 * whose glass the scheme itself makes solid white, with Keep
 * off -- the setting to Off in one tap -- and the app's close, either of
 * which keeps it from coming back. It was black, as the owner's first
 * canvas drew it, the one banner of its own look. Mounted with the map's banners (MapBanners); it runs the scheme
 * itself (useSunlight) so the attribute is kept whatever is shown.
 */
export default function SunlightBanner() {
  useSunlight();
  const chartLight = usePreferences((s) => s.chartLight);
  const setChartLight = usePreferences((s) => s.setChartLight);
  const bright = useSunlightSensor((s) => s.bright);
  const seen = useTips((s) => s.seen);
  const see = useTips((s) => s.see);
  if (chartLight !== "auto" || !bright || !unseen(seen, SEEN)) return null;
  return (
    <MapBanner
      data-testid="sunlight-banner"
      icon={Sun}
      tone="tint"
      title="Bright light: high-contrast chart on."
      actions={
        <>
          <BannerButton
            className="font-semibold"
            onClick={() => {
              setChartLight("off");
              see(SEEN);
            }}
            data-testid="sunlight-keep-off"
          >
            Keep off
          </BannerButton>
          <BannerButton onClick={() => see(SEEN)} data-testid="sunlight-banner-close">
            OK
          </BannerButton>
        </>
      }
    />
  );
}
