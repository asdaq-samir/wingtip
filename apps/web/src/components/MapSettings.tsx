import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListGroup, ListRow } from "./GroupedList";
import PullDown from "./PullDown";
import Segmented from "./Segmented";
import SwitchRow from "./SwitchRow";
import GlideRingRow from "./GlideRingRow";
import AirportWeatherSettings from "./AirportWeatherSettings";
import MapPictureChoices from "./MapPictureChoices";
import { MapAlertsGroup, MapSourcesGroup } from "./MapSettingsGroups";
import { clearOwnTrail, useOwnTrail } from "../lib/map/position/ownTrail";
import {
  BASE_CHARTS,
  usePreferences,
  type BaseChart,
  type ChartLight,
  type ChartNight,
  type MapOverlay,
  type OverlayStrength,
  type Terrain,
} from "../lib/preferences";
import { useShownOverlay } from "../lib/map/sources/useShownOverlay";
import { USGS_URL } from "../lib/map/sources/imagery";
import { useGoogleSession } from "../lib/map/sources/googleSession";
import { OWN_SHIP_LOOKS, ownShipSvg, type OwnShipLook } from "../lib/map/position/ownShipLook";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { googleMapsQuery } from "../lib/queryClient";
import { keepingAvailable } from "../lib/map/route/keepRoute";
import SearchHint from "./SearchHint";
import { CHART } from "../lib/tokens";
import { clearanceWords } from "../lib/map/terrainClearanceWords";
import { FieldError } from "./ui/field";

/**
 * The map's settings, the whole of the map's own button's card
 * (MapSettingsButton), laid out as Apple Maps' "Choose Map" card at the
 * owner's pick (2026-10-27, canvas RZDPvJ6hxfp93UL53LYLec; the owner's
 * screenshot, 2026-11-10): the charts as pictures, the weather over them
 * (`weather`), the overlay, then what is drawn on the map as iOS's
 * switches, the alerts, how the chart looks, then where its data comes
 * from. It
 * was one list of nineteen rows of three kinds of control. The alerts,
 * Setup's for a while, are here again since 2026-11-05, at the owner's
 * ask; Setup's Layout (QuickControls) has FPL, the theme, the sheet's
 * edge and light or dark. Since the owner's split
 * (2026-10-27: "Everything else in the overlay"), with no Settings page,
 * this is the one home of everything else: the app's look, the chart at
 * night and own ship's look among it.
 */
export default function MapSettings({ weather }: { weather?: ReactNode }) {
  const prefs = usePreferences();
  const trailed = useOwnTrail((s) => s.path.length > 1);
  // A Google choice without a key is none (useShownOverlay).
  const overlay = useShownOverlay();
  // Google's only where the deployment has a key for it.
  const { data: google } = useQuery(googleMapsQuery);
  const googleSession = useGoogleSession(overlay === "google-satellite" ? "satellite" : "map", overlay.startsWith("google"));
  const sec = prefs.base === "sec";
  return (
    <div className="flex flex-col gap-5" data-testid="map-settings-groups">
      {/* The charts first, as Apple Maps' card has its maps, the first as
          wide as the card. */}
      <MapPictureChoices
        title="Chart"
        lead
        value={prefs.base}
        onChange={(v) => prefs.setBase(v as BaseChart)}
        testId="base-chart-select"
        options={BASE_CHARTS.map((b) => ({ value: b.kind, label: b.label, src: chartPicture(b.kind) }))}
      />
      {/* Then the weather drawn over it (WeatherSettings). */}
      {weather}
      {/* Over the chart, at the pilot's ask (OverlayTiles): the USGS's
          aerial imagery, or Google's map or its satellite imagery where
          this deployment has a Google key; and how strongly it covers the
          chart, the route and the marks over it either way. Google picked
          here is Google's imagery close in too, past the chart's own
          detail, where the USGS's public-domain imagery is otherwise
          (useCloseImagery). */}
      <div className="flex flex-col gap-2">
        <MapPictureChoices
          title="Overlay"
          value={overlay.startsWith("google") ? "google" : overlay}
          testId="overlay-select"
          onChange={(v) => prefs.setOverlay((v === "google" ? "google-map" : v) as MapOverlay)}
          options={[
            { value: "none", label: "None", src: chartPicture(prefs.base), faded: true },
            { value: "usgs", label: "Imagery", src: USGS_PICTURE },
            ...(google ? [{ value: "google", label: "Google", className: "bg-[linear-gradient(135deg,#a8d5f2,#d9ecd1)]" }] : []),
          ]}
        />
        {overlay !== "none" && (
          <ListGroup>
            {overlay.startsWith("google") && google && (
              <ListRow title="Google">
                <Segmented
                  label="Google"
                  value={overlay}
                  onChange={(v) => prefs.setOverlay(v as MapOverlay)}
                  testId="google-overlay-select"
                  options={[
                    { value: "google-map", label: "Map" },
                    { value: "google-satellite", label: "Satellite" },
                  ]}
                />
              </ListRow>
            )}
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
        {overlay.startsWith("google") && googleSession.isError && (
          // Where it happens: a key restricted to another site, the Map Tiles
          // API off or no quota leave Google's map blank otherwise.
          <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="google-problem">
            Google's map didn't load. Check that this site and the Map Tiles API are allowed for the key.
          </FieldError>
        )}
      </div>
      <ListGroup title="On the Map">
        {/* The route's VFR checkpoints, on either map: the planner's
            numbered checkpoints at every zoom and the dim landmarks they
            were chosen from closer in; off, the course line and its two
            airports alone. */}
        <SwitchRow title="VFR Checkpoints" on={prefs.waypoints} onChange={prefs.setWaypoints} testId="waypoints-toggle" />
        {/* The Class B, C and D's lines and altitudes over the chart
            (AirspaceGl), and the VORs and enroute fixes (NavaidsGl):
            on unless turned off, the owner's pick of the map's looks. */}
        <SwitchRow title="Airspace" on={prefs.airspace} onChange={prefs.setAirspace} testId="airspace-toggle" />
        <SwitchRow title="VORs and Fixes" on={prefs.navaids} onChange={prefs.setNavaids} testId="navaids-toggle" />
        {/* The temporary flight restrictions, from tfr.faa.gov: on unless
            turned off, as a pilot must know of every one near the route
            (14 CFR 91.103). */}
        <SwitchRow title="TFRs" on={prefs.tfrs} onChange={prefs.setTfrs} testId="tfrs-toggle" />
        {/* The airplanes ADS-B receivers hear about the map (TrafficGl),
            from adsb.lol: off unless turned on, as it asks a third party
            every five seconds. Setup's Controls has it too, for the
            cockpit, as iOS has Wi-Fi in Control Center and Settings. */}
        <SwitchRow title="Traffic" on={prefs.traffic} onChange={prefs.setTraffic} testId="traffic-toggle" />
        {/* The Class B airports' weather now, as chips on the map, and
            the terminal sheet over the base wherever there is one: the
            TAC over the sectional, the IFR area chart over the IFR
            charts. A chip's card pins its field's sheet either way. */}
        <SwitchRow title="Class B Weather" on={prefs.classB} onChange={prefs.setClassB} testId="class-b-toggle" />
        <SwitchRow title={sec ? "Terminal Area Charts" : "IFR Area Charts"} on={prefs.tac} onChange={prefs.setTac} testId="tac-toggle" />
        {/* The privately owned fields (the owner, 2026-10-27): off by
            default, as a field landed at only by its owner's leave, on to
            see them. */}
        <SwitchRow title="Private Fields" on={prefs.privateFields} onChange={prefs.setPrivateFields} testId="private-toggle" />
        {/* The fields the armed services own and keep to themselves: off by
            default, as most pilots may not land there without the
            service's permission. A joint-use field is drawn either way. */}
        <SwitchRow title="Military Fields" on={prefs.military} onChange={prefs.setMilitary} testId="military-toggle" />
      </ListGroup>
      {/* Each field's weather over the chart: a halo, a dot or the station
          model, the wind arrows and the getting-worse badge. */}
      <AirportWeatherSettings />
      <MapAlertsGroup />
      <ListGroup title="Appearance">
        {/* The white paper chart dimmed in the dark theme, so it does not
            take the pilot's night vision; only its tiles (index.css). */}
        <ListRow title="Chart at Night">
          <Segmented
            label="Chart at night"
            value={prefs.chartNight}
            onChange={(v) => prefs.setChartNight(v as ChartNight)}
            testId="chart-night-select"
            options={[
              { value: "normal", label: "Normal" },
              { value: "dimmed", label: "Dimmed" },
            ]}
          />
        </ListRow>
        {/* The chart in bright sunlight (lib/sunlight): from the phone's
            light sensor where the browser has one, or by hand. */}
        <ListRow title="Sunlight">
          <Segmented
            label="Sunlight"
            value={prefs.chartLight}
            onChange={(v) => prefs.setChartLight(v as ChartLight)}
            testId="sunlight-select"
            options={[
              { value: "auto", label: "Auto" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </ListRow>
        {/* The ground under the chart (TerrainGl): flat as printed, its
            relief shaded over it, or stood up in 3D with the map tilted by
            two fingers, the obstacles and the route at its altitudes over
            it. A pick of three, segmented; here alone, as every other way
            the map is drawn is. In 3D, what the ground's colours near a
            route are, and that they are a view, not clearance. */}
        <ListRow title="Terrain" description={prefs.terrain === "3d" ? clearanceWords() : undefined}>
          <Segmented
            label="Terrain"
            value={prefs.terrain}
            onChange={(v) => prefs.setTerrain(v as Terrain)}
            testId="terrain-select"
            options={[
              { value: "flat", label: "Flat" },
              { value: "shaded", label: "Shaded" },
              { value: "3d", label: "3D" },
            ]}
          />
        </ListRow>
        {/* Own ship on the chart, a plane or the arrow, at the owner's ask: a menu, each with its picture. */}
        <ListRow title="You on the Map">
          <PullDown<OwnShipLook>
            label="You on the map"
            value={prefs.ownShipLook}
            onChange={prefs.setOwnShipLook}
            testId="own-ship-look"
            options={OWN_SHIP_LOOKS.map((o) => ({
              value: o.value,
              text: o.label,
              testId: `own-ship-look-${o.value}`,
              label: (
                <>
                  <span className="size-5 shrink-0" dangerouslySetInnerHTML={{ __html: ownShipSvg(o.value, CHART.mapBlue, 20) }} />
                  {o.label}
                </>
              ),
            }))}
          />
        </ListRow>
        {/* The glide ring about own ship, off unless turned on (GlideRingGl; the owner, 2026-11-09). */}
        <GlideRingRow />
        {/* Own ship's path flown (OwnTrailGl), put away here: it starts again with the next flight. */}
        <ListRow title="Clear Your Path" disabled={!trailed} onClick={clearOwnTrail} data-testid="own-trail-clear" />
      </ListGroup>
      {/* The base chart along each route loaded, held for the air
          (useKeepOffline); how a keep goes is its toast. Over plain http
          there is no service worker to hold it, and it cannot be on. Here
          since Theme (the app's look) took its place in Setup's Controls (the owner,
          2026-10-27). */}
      <ListGroup title="Offline">
        <SwitchRow
          title="Keep for the Air"
          on={prefs.keepOffline && keepingAvailable()}
          onChange={prefs.setKeepOffline}
          disabled={!keepingAvailable()}
          testId="keep-offline-toggle"
        />
      </ListGroup>
      <MapSourcesGroup />
      <SearchHint />
    </div>
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
