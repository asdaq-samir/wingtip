import { altFt, zuluTime } from "../../lib/format";
import type { RouteWeather } from "../../lib/api/types";
import { CHART, WEATHER } from "../../lib/tokens";
import type { profileObstacles } from "./sideViewHazards";

/** How wide a TAF station's cloud base is drawn along the route, a share
 *  of it either side: a mark at the station, not a deck across the map. */
const CLOUD_HALF = 0.05;

/** The side view's x and y, the chart's own (MiniProfile). */
export interface Axes {
  x: (nm: number) => number;
  y: (ft: number) => number;
  /** The chart's top, ft: a line over it is not drawn pinned to it. */
  top: number;
}

const LEVEL_STROKE: Record<string, string> = { warning: "var(--destructive)", caution: CHART.caution };

/** An ISO time as reports give it, "1120Z"; "" with none. */
const zulu = (iso: string | null | undefined) => (iso ? zuluTime(new Date(iso)) : "");

/**
 * What the side view draws over its ground beside the airspace (inside
 * MiniProfile's stretched SVG): each obstacle a post from its ground to
 * its top (the DOF's AGL under its AMSL), in the ground's red or amber
 * where the engine says it comes near the altitude shown; each TAF
 * station's forecast cloud base a dashed bar at the station; the freezing
 * level a dashed line along the route; and the icing G-AIRMETs as bands
 * between their altitudes, from the freezing level where they say so.
 */
export function HazardMarks({
  obstacles,
  weather,
  axes: { x, y, top },
  lengthNm,
}: {
  obstacles: ReturnType<typeof profileObstacles>;
  weather: RouteWeather | undefined;
  axes: Axes;
  lengthNm: number;
}) {
  const freezing = (weather?.freezing ?? []).filter((f) => f.ft <= top);
  const lowestFreezing = freezing.length ? Math.min(...freezing.map((f) => f.ft)) : null;
  return (
    <g data-testid="profile-hazards">
      {weather?.icing.map((ice, i) => {
        const low = ice.low_ft ?? (ice.from_freezing_level ? lowestFreezing : 0) ?? 0;
        const high = ice.high_ft ?? low;
        return (
          <rect
            key={`ice${i}`}
            x={x(ice.from_nm)}
            width={Math.max(1, x(ice.to_nm) - x(ice.from_nm))}
            y={y(high)}
            height={Math.max(1, y(low) - y(high))}
            fill={WEATHER.icing}
            fillOpacity={0.14}
            stroke={WEATHER.icing}
            strokeOpacity={0.6}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            data-testid="profile-icing"
          />
        );
      })}
      {freezing.length > 1 && (
        <path
          d={freezing.map((f, i) => `${i ? "L" : "M"}${x(f.along_nm).toFixed(1)} ${y(f.ft).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={WEATHER.icing}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
          data-testid="profile-freezing"
        />
      )}
      {weather?.clouds
        .filter((c) => c.base_ft <= top)
        .map((c) => (
          <line
            key={c.station}
            x1={x(Math.max(0, c.along_nm - CLOUD_HALF * lengthNm))}
            x2={x(Math.min(lengthNm, c.along_nm + CLOUD_HALF * lengthNm))}
            y1={y(c.base_ft)}
            y2={y(c.base_ft)}
            stroke={WEATHER.mountains}
            strokeWidth={3}
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
            data-testid="profile-cloud"
          />
        ))}
      {obstacles.map((o, i) => (
        <line
          key={`o${i}`}
          x1={x(o.along_nm)}
          x2={x(o.along_nm)}
          y1={y(o.amsl_ft - (o.agl_ft ?? 0))}
          y2={y(o.amsl_ft)}
          stroke={(o.level && LEVEL_STROKE[o.level]) || CHART.obstacle}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          data-testid="profile-obstacle"
        />
      ))}
    </g>
  );
}

/** The named obstacles' heights over their tops, as the sectional prints
 *  an obstacle's (AMSL over, AGL in brackets: FAA Aeronautical Chart
 *  User's Guide, Obstructions): words, not drawn in the stretched SVG. */
export function ObstacleNames({
  obstacles,
  axes,
  width,
  height,
}: {
  obstacles: ReturnType<typeof profileObstacles>;
  axes: Axes;
  width: number;
  height: number;
}) {
  return (
    <>
      {obstacles
        .filter((o) => o.named)
        .map((o) => (
          <span
            key={`${o.along_nm}-${o.amsl_ft}`}
            aria-hidden="true"
            data-testid="profile-obstacle-name"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-background/80 px-0.5 leading-tight opacity-[calc(1-var(--roll-on,0))]"
            style={{ left: `${(axes.x(o.along_nm) / width) * 100}%`, top: `${(axes.y(o.amsl_ft) / height) * 100}%` }}
          >
            {altFt(o.amsl_ft)}
            {o.agl_ft != null && ` (${altFt(o.agl_ft)})`}
          </span>
        ))}
    </>
  );
}

/** Whose each weather line is and for when, under the side view: the TAFs'
 *  cloud bases (station and issue), the freezing level's forecast (its
 *  run and the time it is read at) and the G-AIRMETs' icing (valid and
 *  issued), each in its own colour; what could not be read said so. */
export function WeatherKey({ weather }: { weather: RouteWeather | undefined }) {
  if (!weather) return null;
  const parts: { key: string; colour: string; words: string }[] = [];
  for (const c of weather.clouds)
    parts.push({
      key: `c${c.station}`,
      colour: WEATHER.mountains,
      words: `Ceiling ${altFt(c.base_ft)} · ${c.station} TAF ${zulu(c.issued)}`.trim(),
    });
  if (weather.freezing.length && weather.freezing_source) {
    const s = weather.freezing_source;
    const low = Math.min(...weather.freezing.map((f) => f.ft));
    parts.push({
      key: "fz",
      colour: WEATHER.icing,
      words: `Freezing level from ${altFt(low)} · ${s.label}${s.run ? ` ${zulu(s.run)} run` : ""}${s.valid_at ? `, for ${zulu(s.valid_at)}` : ""}`,
    });
  }
  for (const [i, ice] of weather.icing.entries())
    parts.push({
      key: `i${i}`,
      colour: WEATHER.icing,
      words: `Icing ${ice.from_freezing_level ? "FZL" : altFt(ice.low_ft ?? 0)}–${altFt(ice.high_ft ?? 0)} · G-AIRMET for ${zulu(ice.valid_at)}${ice.issued ? `, issued ${zulu(ice.issued)}` : ""}`,
    });
  for (const gone of weather.unavailable)
    parts.push({
      key: `u${gone}`,
      colour: CHART.fieldUnknown,
      words: `${gone === "clouds" ? "Cloud bases" : gone === "freezing" ? "Freezing level" : "Icing"} not available`,
    });
  if (!parts.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 pt-1" data-testid="profile-weather-key">
      {parts.map((p) => (
        <li key={p.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded" style={{ background: p.colour }} />
          <span>{p.words}</span>
        </li>
      ))}
    </ul>
  );
}
