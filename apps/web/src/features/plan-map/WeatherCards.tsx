import type { MapPirep, StationWind, WeatherArea } from "../../lib/api/types";
import { capitalised, faaWords } from "../../lib/advisories";
import { areaWords, routeThrough } from "./weatherMap";
import { bearing, knots, mapLevel, zuluTime } from "../../lib/format";
import { WINDS_MODELLED } from "../../lib/windsAloft";
import { useGeo } from "../../lib/geo";
import { MapCard } from "../../lib/map/cards/MapCard";
import { usePointActions } from "../../lib/map/cards/pointActions";
import { useAreaWhileUp, useRingWhileUp } from "../../lib/map/mapPick";
import { fixRadialDistance } from "../../lib/navaid";
import { degreesMinutes } from "../../lib/coords";

/**
 * The weather on the planner's map, at the pilot's pick: the cards a tap
 * on an area, a PIREP or a wind barb opens (the map draws them, from
 * weatherLayer's tiles, box and marks: features/plan-map/layers/WeatherGl).
 */

/** UTC as reports give it, "1255Z": lib/format's one form, where it was cut by hand from an ISO string. */
const zulu = (unix: number) => zuluTime(new Date(unix * 1000));

export function AreaCard({ area, line, altitudeFt }: { area: WeatherArea; line: [number, number][] | null; altitudeFt: number | null }) {
  const { title, altitudes } = areaWords(area);
  const when =
    area.kind === "gairmet"
      ? area.valid_from != null
        ? `Forecast for ${zulu(area.valid_from)}`
        : null
      : [area.valid_from != null && `From ${zulu(area.valid_from)}`, area.valid_to != null && `to ${zulu(area.valid_to)}`]
          .filter(Boolean)
          .join(" ");
  const geo = useGeo();
  const through = line && geo ? routeThrough(geo, area, line, altitudeFt) : null;
  // Its edge lit while its card is up (WeatherGl).
  useAreaWhileUp({ kind: "weather", id: String(area.id) });
  return (
    <MapCard title={title} subtitle={[area.severity && faaWords(area.severity), when].filter(Boolean).join(" · ")}>
      <div className="space-y-1 text-left" data-testid="weather-area-card">
        {altitudes && <p>{altitudes}</p>}
        {/* What it means for this flight: how far the route is in it, and
            whether the planned altitude is under, in or over it. */}
        {through && (
          <p className="font-semibold" data-testid="weather-area-route">
            Your route crosses it for {Math.round(through.nm)} nm
            {through.relation && altitudeFt != null
              ? `, at ${mapLevel(altitudeFt)}: ${through.relation === "in" ? "in it" : `${through.relation} it`}`
              : ""}
            .
          </p>
        )}
        {area.raw && <p className="text-muted-foreground">{area.kind === "gairmet" ? faaWords(area.raw) : area.raw}</p>}
      </div>
    </MapCard>
  );
}

/** A PIREP's card, on either map: where the report is the name, off the
 *  nearest VOR in view as a report gives it (its /OV, "JOT 045° 12 nm",
 *  the engine's fix_radial_distance; AIM 7-1-18), else its latitude and
 *  longitude; what it is, when and from what under it (the owner,
 *  2026-11-18: the title is where it is, the line its kind). */
export function PirepCard({ pirep }: { pirep: MapPirep }) {
  const stations = usePointActions((s) => s.stations);
  useRingWhileUp(pirep);
  return (
    <MapCard
      title={fixRadialDistance(pirep, stations) ?? degreesMinutes(pirep)}
      subtitle={[pirep.urgent ? "Urgent PIREP" : "PIREP", pirep.observed_at && zuluTime(new Date(pirep.observed_at)), pirep.aircraft]
        .filter(Boolean)
        .join(" · ")}
    >
      <div className="space-y-1 text-left">
        {pirep.altitude_ft != null && <p>At {mapLevel(pirep.altitude_ft)}</p>}
        {pirep.turbulence && <p>Turbulence: {faaWords(pirep.turbulence)}</p>}
        {pirep.icing && <p>Icing: {faaWords(pirep.icing)}</p>}
        {/* The report as it was sent, as every raw report stays. */}
        {pirep.raw && <p className="font-mono text-muted-foreground">{pirep.raw}</p>}
      </div>
    </MapCard>
  );
}

/** A station's wind aloft's card, on either map: the station the name,
 *  the wind and the altitude under it (the owner, 2026-11-18: the title is
 *  the thing's ident, the line its kind and details), and whose winds they
 *  are, the GFS's (lib/windsAloft). */
export function WindCard({ wind, altitudeFt }: { wind: StationWind; altitudeFt: number }) {
  useRingWhileUp(wind);
  return (
    <MapCard
      title={wind.ident}
      subtitle={`Wind ${bearing(wind.dir_true_deg)} true at ${knots(wind.speed_kt)} · at ${mapLevel(altitudeFt)}`}
    >
      <div className="space-y-1 text-left">
        {wind.temp_c != null && (
          <p>
            {wind.temp_c > 0 ? "+" : ""}
            {wind.temp_c} °C
          </p>
        )}
        <p className="text-muted-foreground">{capitalised(WINDS_MODELLED)}</p>
      </div>
    </MapCard>
  );
}
