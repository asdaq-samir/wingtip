import type { MapPirep, StationWind, WeatherArea } from "../../../lib/api/types";
import { faaWords } from "../../../lib/advisories";
import { areaWords, routeThrough } from "../lib/weatherMap";
import { bearing, knots, mapLevel } from "../../../lib/format";
import { WINDS_MODELLED } from "../../../lib/windsAloft";
import { useGeo } from "../../../lib/geo";
import { MapCard } from "../../../lib/map/cards/MapCard";

/**
 * The weather on the planner's map, at the pilot's pick: the cards a tap
 * on an area, a PIREP or a wind barb opens (the map draws them, from
 * weatherLayer's tiles, box and marks: features/plan/map/layers/WeatherGl).
 */

const zulu = (unix: number) => `${new Date(unix * 1000).toISOString().slice(11, 16)}Z`;

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

/** A PIREP's card, on either map. */
export function PirepCard({ pirep }: { pirep: MapPirep }) {
  return (
    <MapCard
      title={pirep.urgent ? "Urgent PIREP" : "PIREP"}
      subtitle={[pirep.observed_at && `${pirep.observed_at.slice(11, 16)}Z`, pirep.aircraft].filter(Boolean).join(" · ")}
    >
      <div className="space-y-1 text-left" data-testid="pirep-card">
        {pirep.altitude_ft != null && <p>At {mapLevel(pirep.altitude_ft)}</p>}
        {pirep.turbulence && <p>Turbulence: {faaWords(pirep.turbulence)}</p>}
        {pirep.icing && <p>Icing: {faaWords(pirep.icing)}</p>}
        {/* The report as it was sent, as every raw report stays. */}
        {pirep.raw && <p className="font-mono text-muted-foreground">{pirep.raw}</p>}
      </div>
    </MapCard>
  );
}

/** A station's wind aloft's card, on either map: the station, the
 *  altitude and whose winds they are, the GFS's (lib/windsAloft). */
export function WindCard({ wind, altitudeFt }: { wind: StationWind; altitudeFt: number }) {
  return (
    <MapCard
      title={`${bearing(wind.dir_true_deg)} true at ${knots(wind.speed_kt)}`}
      subtitle={`${wind.ident} · at ${mapLevel(altitudeFt)} · ${WINDS_MODELLED}`}
    >
      {wind.temp_c != null && (
        <p className="text-left" data-testid="wind-card">
          {wind.temp_c > 0 ? "+" : ""}
          {wind.temp_c} °C
        </p>
      )}
    </MapCard>
  );
}
