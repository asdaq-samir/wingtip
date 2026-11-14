import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { FieldError } from "../../components/ui/field";
import Segmented from "../../components/Segmented";
import MapPictureChoices from "./MapPictureChoices";
import MapLayers from "./MapLayers";
import {
  BASE_CHARTS,
  HEIGHT_STRETCHES,
  usePreferences,
  type BaseChart,
  type HeightStretch,
  type MapOverlay,
  type OverlayStrength,
} from "../../lib/preferences";
import { useShownOverlay } from "../../lib/map/sources/useShownOverlay";
import { USGS_URL } from "../../lib/map/sources/imagery";
import { useGoogleSession } from "../../lib/map/sources/googleSession";
import { googleMapsQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";

/**
 * The Map card, what is on the map and nothing else, one screen at a
 * phone's width with nothing to scroll, as Apple Maps' "Choose Map" card
 * is (the owner's pick, 2026-10-27, canvas RZDPvJ6hxfp93UL53LYLec; the
 * owner's screenshot, 2026-11-10): the charts as pictures, the overlay
 * over them with its strength, in 3D how tall it stands its heights
 * (HeightsChoice), the layers as tiles (MapLayers). How the
 * map behaves -- the airport weather, the glide ring, the alerts, keeping
 * the charts, where the data comes from -- is the app's Settings, which
 * the gear at the card's head opens at its Map group (option A of the
 * account canvas, the owner, 2026-11-13); the Map Settings page that was
 * here went into it.
 */
export default function MapCard() {
  const prefs = usePreferences();
  return (
    <div className="flex flex-col gap-5" data-testid="map-settings-groups">
      {/* The charts first, as Apple Maps' card has its maps. */}
      <MapPictureChoices
        title="Chart"
        value={prefs.base}
        onChange={(v) => prefs.setBase(v as BaseChart)}
        testId="base-chart-select"
        options={BASE_CHARTS.map((b) => ({ value: b.kind, label: b.label, src: chartPicture(b.kind) }))}
      />
      <OverlayChoice />
      {prefs.threeD && <HeightsChoice />}
      <MapLayers />
    </div>
  );
}

/** The Google swatch: a picture of Google's land and water, not the
 *  app's look; its satellite's the same, darkened. */
const GOOGLE_SWATCH = "bg-[linear-gradient(135deg,#a8d5f2,#d9ecd1)]";

/**
 * Over the chart, at the pilot's ask (OverlayTiles), one row of pictures
 * (the owner, 2026-11-13): none, the USGS's aerial imagery, or Google's
 * map or its satellite imagery where this deployment has a Google key --
 * Google's two its own pictures here, where they were one picture and a
 * Map or Satellite row on the Map Settings page. Google picked is
 * Google's imagery close in too, past the chart's own detail, where the
 * USGS's public-domain imagery is otherwise (useCloseImagery). How
 * strongly it covers the chart, the route and the marks over it under it,
 * only while one is picked.
 */
function OverlayChoice() {
  const prefs = usePreferences();
  // A Google choice without a key is none (useShownOverlay).
  const overlay = useShownOverlay();
  // Google's only where the deployment has a key for it.
  const { data: google } = useQuery(googleMapsQuery);
  return (
    <div className="flex flex-col gap-2">
      <MapPictureChoices
        title="Overlay"
        value={overlay}
        testId="overlay-select"
        onChange={(v) => prefs.setOverlay(v as MapOverlay)}
        options={[
          { value: "none", label: "None", src: chartPicture(prefs.base), faded: true },
          { value: "usgs", label: "USGS", src: USGS_PICTURE },
          ...(google
            ? [
                { value: "google-map", label: "Google Map", className: GOOGLE_SWATCH },
                { value: "google-satellite", label: "Google Satellite", className: cn(GOOGLE_SWATCH, "brightness-50 saturate-150") },
              ]
            : []),
        ]}
      />
      {overlay !== "none" && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className={cn("text-foreground", TEXT.row)}>Strength</span>
          <Segmented
            label="Strength"
            value={prefs.overlayStrength}
            onChange={(v) => prefs.setOverlayStrength(v as OverlayStrength)}
            testId="overlay-strength"
            options={[
              { value: "faint", label: "Faint" },
              { value: "half", label: "Half" },
              { value: "full", label: "Full" },
            ]}
          />
        </div>
      )}
      <GoogleProblem />
    </div>
  );
}

/**
 * How many times the 3D view stands its heights up (lib/prefs'
 * HeightStretch): the ground and all that stands over it, by the one
 * factor, so a Class B's shelves read as the upside-down wedding cake
 * they are, which at true scale are slivers (the owner, 2026-11-14). A
 * segmented control, as a discrete setting is (docs/design/rules.md),
 * only while 3D is on, as the overlay's strength only with an overlay;
 * it says the stretch, "×3", and the map's words keep the true altitudes.
 */
function HeightsChoice() {
  const stretch = usePreferences((s) => s.heightStretch);
  const setStretch = usePreferences((s) => s.setHeightStretch);
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className={cn("text-foreground", TEXT.row)}>Heights</span>
      <Segmented
        label="Heights"
        value={String(stretch)}
        onChange={(v) => setStretch(Number(v) as HeightStretch)}
        testId="heights-stretch"
        options={HEIGHT_STRETCHES.map((k) => ({ value: String(k), label: `×${k}` }))}
      />
    </div>
  );
}

/** Where it happens, under the overlay's pictures: a key restricted to
 *  another site, the Map Tiles API off or no quota leave Google's map
 *  blank otherwise (useGoogleSession). */
function GoogleProblem() {
  const overlay = useShownOverlay();
  const googleSession = useGoogleSession(overlay === "google-satellite" ? "satellite" : "map", overlay.startsWith("google"));
  if (!overlay.startsWith("google") || !googleSession.isError) return null;
  return (
    <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="google-problem">
      Google's map didn't load. Check that this site and the Map Tiles API are allowed for the key.
    </FieldError>
  );
}

/** The one tile the overlay's imagery picture is cut from, z/x/y: Chicago
 *  at zoom 9, where the charts' own pictures (public/map-tiles) are from. */
const PICTURE_TILE = [9, 130, 190] as const;

/** A chart's own picture, cut once from that tile of the 2026-10-29 cycle's
 *  @2x PMTiles (the planner image's pmtiles and Pillow: the tile's middle,
 *  16:9, 360 by 202, WebP) and kept with the app, so the card shows it
 *  with no request to the planner, offline too. */
const chartPicture = (kind: BaseChart) => `${import.meta.env.BASE_URL}map-tiles/${kind}.webp`;
/** The USGS's imagery of the same tile (OverlayTiles' service). */
const USGS_PICTURE = USGS_URL.replace("{z}", String(PICTURE_TILE[0]))
  .replace("{x}", String(PICTURE_TILE[1]))
  .replace("{y}", String(PICTURE_TILE[2]));
