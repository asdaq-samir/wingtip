import { ListGroup, ListRow } from "../../components/GroupedList";
import Segmented from "../../components/Segmented";
import SwitchRow from "../../components/SwitchRow";
import { AIRPORT_WEATHER_LOOKS, useAirportWeatherPrefs, type AirportWeatherLook } from "../../lib/map/marks/airportWeatherPrefs";

/**
 * The Map card's Airport Weather page, from its row on the Map Settings
 * page (the owner's picks, 2026-11-10 and 2026-11-13): how each
 * field's weather is drawn -- Off, a Halo in its flight category's colour
 * round the chart's symbol (the default), ForeFlight's Dot in place of the
 * symbol, or the Station model wherever it fits -- as one segmented
 * control, and three switches, all on unless turned off: the station
 * model when zoomed in close, the wind arrows (red past the picked
 * airplane's demonstrated crosswind), and the amber ↓ at a plan's field
 * whose weather gets worse by the pilot's time there. With the look Off
 * the switches have nothing to draw on, and are off.
 */
export default function AirportWeatherSettings() {
  const prefs = useAirportWeatherPrefs();
  const off = prefs.look === "off";
  return (
    <ListGroup>
      {/* Four choices, under the row's name where the row is too narrow
          for both (ListRow). */}
      <ListRow title="Show">
        <Segmented
          label="Airport weather"
          value={prefs.look}
          onChange={(v) => prefs.set({ look: v as AirportWeatherLook })}
          testId="airport-weather-look"
          options={AIRPORT_WEATHER_LOOKS}
        />
      </ListRow>
      <SwitchRow
        title="Station Model When Zoomed In"
        on={!off && prefs.stationClose}
        disabled={off || prefs.look === "station"}
        onChange={(on) => prefs.set({ stationClose: on })}
        testId="airport-weather-station-close"
      />
      <SwitchRow
        title="Wind Barbs"
        on={!off && prefs.windArrows}
        disabled={off}
        onChange={(on) => prefs.set({ windArrows: on })}
        testId="airport-weather-arrows"
      />
      <SwitchRow
        title="Getting Worse by Arrival"
        on={!off && prefs.worseByArrival}
        disabled={off}
        onChange={(on) => prefs.set({ worseByArrival: on })}
        testId="airport-weather-worse"
      />
    </ListGroup>
  );
}
