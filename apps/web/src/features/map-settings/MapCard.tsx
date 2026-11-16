import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { FieldError } from "../../components/ui/field";
import Segmented from "../../components/Segmented";
import { ListGroup, ListRow } from "../../components/GroupedList";
import MapPictureChoices from "./MapPictureChoices";
import MapLayers from "./MapLayers";
import LookChoice from "./LookChoice";
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
import { useTerrainView, useTrueHeightView } from "../plan";

/**
 * The Map card, what is on the map and nothing else, one screen at a
 * phone's width with nothing to scroll, as Apple Maps' "Choose Map" card
 * is (the owner's pick, 2026-10-27, canvas RZDPvJ6hxfp93UL53LYLec; the
 * owner's screenshot, 2026-11-10): the charts as pictures (None first,
 * as the overlay's, the owner, 2026-11-14), the overlay
 * over them with its strength, in 3D how tall it stands its heights
 * (HeightsChoice), the four layers as tiles (MapLayers), and the app's
 * Look, Theme, Appearance, Sunlight and Position, last (LookChoice; the owner, 2026-11-14). How the
 * map behaves -- the airport weather, the glide ring, the alerts, keeping
 * the charts, where the data comes from -- is the app's Settings, which
 * the gear at the card's head opens at its Map group (option A of the
 * account canvas, the owner, 2026-11-13); the Map Settings page that was
 * here went into it.
 */
export default function MapCard() {
  return (
    // One section gap between them all, the tokens' xl (space.xl, 24), as
    // iOS Settings spaces its groups; every section's tiles the one 2x2
    // grid (LayerTile), so the four line up (the owner, 2026-11-14:
    // "every section should have 4 tiles like Layers one").
    <div className="flex flex-col gap-6" data-testid="map-settings-groups">
      <ChartChoice />
      <OverlayChoice />
      <HeightsChoice />
      <MapLayers />
      <LookChoice />
    </div>
  );
}

/**
 * The charts first, as Apple Maps' card has its maps. Each chart's
 * terminal sheet -- the TAC over the sectional, the IFR area chart over
 * the IFR charts -- is always drawn where it exists (ChartGl), with no
 * switch (the owner, 2026-11-14: "TAC switch is not needed, just have it
 * on by default").
 */
function ChartChoice() {
  const prefs = usePreferences();
  return (
    <MapPictureChoices
      title="Chart"
      value={prefs.base}
      onChange={(v) => prefs.setBase(v as BaseChart)}
      testId="base-chart-select"
      options={BASE_CHARTS.map((b) => ({ value: b.kind, label: b.label, ...chartPicture(b.kind) }))}
    />
  );
}

/** An empty map, the picture of None in both rows: the card's plain
 *  surface under a faint grid of the look's hairline colour, so it reads
 *  as a map with nothing drawn on it, where a blank white box read as a
 *  picture that had not loaded (the owner's screenshot, 2026-11-14). */
const EMPTY_MAP = cn(
  "bg-muted",
  "bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-size-[0.75rem_0.75rem]",
);

/** The Google swatch: a picture of Google's land and water, not the
 *  app's look; its satellite's the same, darkened. */
const GOOGLE_SWATCH = "bg-[linear-gradient(135deg,#a8d5f2,#d9ecd1)]";

/**
 * Under the chart, the base map (lib/prefs' overlay; the words were
 * "Overlay" until 2026-11-14, the preference keeps its name), at the
 * pilot's ask (OverlayTiles), one row of pictures
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
        title="Base map"
        value={overlay}
        testId="overlay-select"
        onChange={(v) => prefs.setOverlay(v as MapOverlay)}
        options={[
          { value: "none", label: "None", className: EMPTY_MAP },
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
        <ListGroup>
          <ListRow title="Strength">
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
          </ListRow>
        </ListGroup>
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
 * In the pilot's view and a replay camera's the heights are true
 * whatever is picked (heightStretch's drawnStretch), and a line under it
 * says so, where it applies, not a toast.
 */
function HeightsChoice() {
  const stretch = usePreferences((s) => s.heightStretch);
  const setStretch = usePreferences((s) => s.setHeightStretch);
  const threeD = useTerrainView().mode === "3d";
  const trueView = useTrueHeightView();
  if (!threeD) return null;
  return (
    <ListGroup
      footer={
        trueView && (
          <span data-testid="heights-true">
            {trueView === "pilot" ? "True height in the pilot's view" : "True height while a replay camera follows"}
          </span>
        )
      }
    >
      <ListRow title="Heights">
        <Segmented
          label="Heights"
          value={String(stretch)}
          onChange={(v) => setStretch(Number(v) as HeightStretch)}
          testId="heights-stretch"
          options={HEIGHT_STRETCHES.map((k) => ({ value: String(k), label: `×${k}` }))}
        />
      </ListRow>
    </ListGroup>
  );
}

/** Where it happens, under the base map's pictures: a key restricted to
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

/** The one tile the base map's imagery picture is cut from, z/x/y: Chicago
 *  at zoom 9, where the charts' own pictures (public/map-tiles) are from. */
const PICTURE_TILE = [9, 130, 190] as const;

/** A chart's own picture, cut once from that tile of the 2026-10-29 cycle's
 *  @2x PMTiles (the planner image's pmtiles and Pillow: the tile's middle,
 *  16:9, 360 by 202, WebP) and kept with the app, so the card shows it
 *  with no request to the planner, offline too. None is an empty map
 *  (EMPTY_MAP), as the base map's None is. */
const chartPicture = (kind: BaseChart): { src?: string; className?: string } =>
  kind === "none" ? { className: EMPTY_MAP } : { src: `${import.meta.env.BASE_URL}map-tiles/${kind}.webp` };
/** The USGS's imagery of the same tile (OverlayTiles' service). */
const USGS_PICTURE = USGS_URL.replace("{z}", String(PICTURE_TILE[0]))
  .replace("{x}", String(PICTURE_TILE[1]))
  .replace("{y}", String(PICTURE_TILE[2]));
