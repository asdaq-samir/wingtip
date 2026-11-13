import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { FieldError } from "../../components/ui/field";
import MapPictureChoices from "./MapPictureChoices";
import MapLayers from "./MapLayers";
import { BASE_CHARTS, usePreferences, type BaseChart, type MapOverlay } from "../../lib/preferences";
import { useShownOverlay } from "../../lib/map/sources/useShownOverlay";
import { USGS_URL } from "../../lib/map/sources/imagery";
import { useGoogleSession } from "../../lib/map/sources/googleSession";
import { googleMapsQuery } from "../../lib/queryClient";
import { openMapPage } from "../../lib/mapCard";
import { TEXT } from "../../lib/text";

/**
 * The Map card's first page, what is on the map, one screen at a phone's
 * width with nothing to scroll (the owner's pick, option A of the map
 * settings canvas, 2026-11-13), as Apple Maps' "Choose Map" card is (the
 * owner's pick, 2026-10-27, canvas RZDPvJ6hxfp93UL53LYLec; the owner's
 * screenshot, 2026-11-10): the charts as pictures, the overlay over them,
 * the layers as tiles (MapLayers), and at its foot the Map Settings row,
 * the page of how the map looks and the rest (MapSettingsPage). It was
 * one long card of thirty-odd controls. Since the owner's split
 * (2026-10-27: "Everything else in the overlay"), with no Settings page
 * of the app's, the two are the one home of everything else of the map.
 */
export default function MapCard() {
  const prefs = usePreferences();
  // A Google choice without a key is none (useShownOverlay).
  const overlay = useShownOverlay();
  // Google's only where the deployment has a key for it.
  const { data: google } = useQuery(googleMapsQuery);
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
      {/* Over the chart, at the pilot's ask (OverlayTiles): the USGS's
          aerial imagery, or Google's map or its satellite imagery where
          this deployment has a Google key; how strongly it covers the
          chart is the Map Settings page's (Overlay Strength). Google
          picked here is Google's imagery close in too, past the chart's
          own detail, where the USGS's public-domain imagery is otherwise
          (useCloseImagery). */}
      <div className="flex flex-col gap-2">
        <MapPictureChoices
          title="Overlay"
          value={overlay.startsWith("google") ? "google" : overlay}
          testId="overlay-select"
          onChange={(v) => prefs.setOverlay((v === "google" ? "google-map" : v) as MapOverlay)}
          options={[
            { value: "none", label: "None", src: chartPicture(prefs.base), faded: true },
            { value: "usgs", label: "USGS", src: USGS_PICTURE },
            ...(google ? [{ value: "google", label: "Google", className: "bg-[linear-gradient(135deg,#a8d5f2,#d9ecd1)]" }] : []),
          ]}
        />
        <GoogleProblem />
      </div>
      <MapLayers />
      <ListGroup>
        <ListRow title="Map Settings" chevron onClick={() => openMapPage("settings")} data-testid="map-settings-more" />
      </ListGroup>
    </div>
  );
}

/** Where it happens, under the overlay's pictures and the Map Settings
 *  page's Google row alike: a key restricted to another site, the Map
 *  Tiles API off or no quota leave Google's map blank otherwise. One
 *  session query under both (useGoogleSession). */
export function GoogleProblem() {
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
