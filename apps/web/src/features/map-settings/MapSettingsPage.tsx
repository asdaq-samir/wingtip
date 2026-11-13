import { useQuery } from "@tanstack/react-query";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PullDown from "../../components/PullDown";
import Segmented from "../../components/Segmented";
import SwitchRow from "../../components/SwitchRow";
import SearchHint from "../../components/SearchHint";
import { ALERT_MODES, useAlertMode } from "../../components/alertMode";
import GlideRingRow from "./GlideRingRow";
import { GoogleProblem } from "./MapCard";
import { clearOwnTrail, useOwnTrail } from "../../lib/map/position/ownTrail";
import { usePreferences, type MapOverlay, type OverlayStrength, type Terrain } from "../../lib/preferences";
import { useShownOverlay } from "../../lib/map/sources/useShownOverlay";
import { OWN_SHIP_LOOKS, ownShipSvg, type OwnShipLook } from "../../lib/map/position/ownShipLook";
import { AIRPORT_WEATHER_LOOKS, useAirportWeatherPrefs } from "../../lib/map/marks/airportWeatherPrefs";
import { googleMapsQuery } from "../../lib/queryClient";
import { keepingAvailable } from "../../lib/map/route/keepRoute";
import { openMapPage } from "../../lib/mapCard";
import { CHART } from "../../lib/tokens";
import { clearanceWords } from "../../lib/map/terrainClearanceWords";

/**
 * The Map card's Map Settings page, from the row at the card's foot (the
 * owner's pick, option A of the map settings canvas, 2026-11-13): how the
 * map looks, what else is drawn on it, and the rest -- the alerts, keeping
 * the charts for the air, where the data comes from, the search. The
 * airport weather, the alerts and the sources are a page each, a row
 * here with what is set at its end. The chart at night and in sunlight
 * are Setup's (its Appearance and Layout, the owner, 2026-11-13), one home
 * each.
 */
export default function MapSettingsPage() {
  return (
    <div className="flex flex-col gap-5" data-testid="map-settings-page">
      <LookGroup />
      <OnTheMapGroup />
      <MoreGroup />
      <SearchHint />
    </div>
  );
}

function LookGroup() {
  const prefs = usePreferences();
  const overlay = useShownOverlay();
  const { data: google } = useQuery(googleMapsQuery);
  return (
    <div className="flex flex-col gap-2">
      <ListGroup title="Look">
        {/* The ground under the chart in 2D (TerrainGl): flat as printed,
            or its relief shaded over it, segmented. 3D is the map's own
            round button (ThreeDButton, the owner 2026-11-13, as Apple
            Maps' 3D is), over either; while it is on, what the ground's
            colours near a route are, and that they are a view, not
            clearance, under this row. */}
        <ListRow title="Terrain" description={prefs.threeD ? clearanceWords() : undefined}>
          <Segmented
            label="Terrain"
            value={prefs.terrain}
            onChange={(v) => prefs.setTerrain(v as Terrain)}
            testId="terrain-select"
            options={[
              { value: "flat", label: "Flat" },
              { value: "shaded", label: "Shaded" },
            ]}
          />
        </ListRow>
        {/* How strongly the overlay picked on the Map card covers the
            chart, the route and the marks over it; with none, nothing to
            set. */}
        {overlay !== "none" && (
          <ListRow title="Overlay Strength">
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
        )}
        {/* Google's map or its satellite imagery, where Google is the
            overlay picked and this deployment has a key for it. */}
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
      </ListGroup>
      {/* Google's failure where Google's Map or Satellite is picked too. */}
      <GoogleProblem />
    </div>
  );
}

function OnTheMapGroup() {
  const prefs = usePreferences();
  const trailed = useOwnTrail((s) => s.path.length > 1);
  const weatherLook = useAirportWeatherPrefs((s) => s.look);
  return (
    <ListGroup title="On the Map">
      {/* Each field's weather over the chart, a page of its own
          (AirportWeatherSettings): its look at the row's end. */}
      <ListRow
        title="Airport Weather"
        value={AIRPORT_WEATHER_LOOKS.find((l) => l.value === weatherLook)?.label}
        chevron
        onClick={() => openMapPage("airport-weather")}
        data-testid="airport-weather-row"
      />
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
  );
}

function MoreGroup() {
  const prefs = usePreferences();
  const [alertMode] = useAlertMode();
  return (
    <ListGroup title="More">
      {/* The in-flight alerts, the copilot and the ATC copilot, a page of
          their own (MapAlertsPage): the alerts' mode at the row's end. */}
      <ListRow
        title="Alerts"
        value={ALERT_MODES.find((m) => m.value === alertMode)?.label}
        chevron
        onClick={() => openMapPage("alerts")}
        data-testid="alerts-row"
      />
      {/* The base chart along each route loaded, held for the air
          (useKeepOffline); how a keep goes is its toast. Over plain http
          there is no service worker to hold it, and it cannot be on. Here
          since Theme (the app's look) took its place in Setup's Controls
          (the owner, 2026-10-27). */}
      <SwitchRow
        title="Keep for the Air"
        on={prefs.keepOffline && keepingAvailable()}
        onChange={prefs.setKeepOffline}
        disabled={!keepingAvailable()}
        testId="keep-offline-toggle"
      />
      {/* Where the map's data comes from and how old it is (MapSourcesPage). */}
      <ListRow title="Sources" chevron onClick={() => openMapPage("sources")} data-testid="sources-row" />
    </ListGroup>
  );
}
