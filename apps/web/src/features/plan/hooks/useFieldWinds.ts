import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import { zuluTime } from "../../../lib/format";
import { useMinuteClock } from "../../../lib/useMinuteClock";
import { airportQuery } from "../../../lib/queryClient";
import { sameField } from "../../../lib/procedures";
import { windPick, type WindPick } from "../lib/pattern";
import { reportedWind, type ReportedWind } from "../format";
import type { NavLogRow } from "../components/navlog/rows";
import type { ProcedureAirport } from "./useProceduresRoute";

/** How far off a field's time must be for its runway to be picked into
 *  the forecast wind rather than the wind now, ms: an hour. */
const FORECAST_AFTER_MS = 60 * 60_000;
const TEN_MIN_MS = 10 * 60_000;

/**
 * Each of the route's fields' wind for FPL's route list (useProceduresRoute,
 * split from it for the audit's WEB-19): its card's report, else the
 * nearest one's, or, where the airplane is there more than an hour from
 * now, the TAF's forecast for then; the runway into it (windPick) and the
 * wind as the field's line says it (reportedOf).
 */
export function useFieldWinds({ airports, rows, depart }: { airports: ProcedureAirport[]; rows: NavLogRow[]; depart: string }) {
  // Each field's card (its weather), for the wind a field with no report
  // of its own goes by: the nearest report's (windPick).
  const cards = useQueries({ queries: airports.map((a) => airportQuery(a.ident)) });
  // When the airplane is at each field: the departure's time, a field
  // landed at its arrival (the rows' times). More than an hour off, its
  // runway is picked into the wind its TAF forecasts for then, not the
  // wind now, at the owner's pick (2026-10-20); to the ten minutes, so a
  // plan streaming in asks again only as its times move that much.
  const now = useMinuteClock();
  const startMs = depart ? Date.parse(depart) : now;
  // Each stop's minutes flown to it, kept while the plan is made again:
  // its time to leave picked (DepartPicker), the stop's time on the ground
  // changes, the nav log is asked for again and its legs stream back in --
  // the picker taken out meanwhile closed under the pilot's finger. The
  // destination's too, for its forecast wind: a runway picked into the
  // wind plans the route again with its pattern flown, and while the legs
  // came back the field's time was gone, its wind the one reported now,
  // and the runway into the forecast was turned to the one into that, and
  // stayed (forecast-wind.spec, KDLH's 9 to 21, 2026-10-28).
  const landsFresh = rows
    .flatMap((r) =>
      (r.kind === "stop" || r.kind === "destination") && r.minutesFlown != null ? [`${r.airport.ident}:${r.minutesFlown}`] : [],
    )
    .join(",");
  const [landed, setLanded] = useState<{ fresh: string; at: Record<string, number> }>({ fresh: "", at: {} });
  if (landsFresh && landsFresh !== landed.fresh) {
    setLanded({
      fresh: landsFresh,
      at: {
        ...landed.at,
        ...Object.fromEntries(
          landsFresh.split(",").map((pair) => [pair.slice(0, pair.lastIndexOf(":")), Number(pair.slice(pair.lastIndexOf(":") + 1))]),
        ),
      },
    });
  }
  const landedAt = (ident: string): number | null => {
    const key = Object.keys(landed.at).find((k) => sameField(k, ident));
    return key === undefined ? null : landed.at[key]!;
  };
  const forecastFor = airports.map((a) => {
    const row =
      a.role === "Departure"
        ? null
        : rows.find((r) => (r.kind === "stop" || r.kind === "destination") && sameField(r.airport.ident, a.ident));
    const flownTo = a.role === "Departure" ? null : (row?.minutesFlown ?? landedAt(a.ident));
    const ms = a.role === "Departure" ? startMs : flownTo == null ? null : startMs + flownTo * 60_000;
    return ms !== null && ms - now > FORECAST_AFTER_MS ? Math.round(ms / TEN_MIN_MS) * TEN_MIN_MS : null;
  });
  const forecasts = useQueries({
    queries: airports.map((a, i) => ({
      queryKey: ["forecastWind", a.ident, forecastFor[i]],
      queryFn: () => api.forecastWind(a.ident, new Date(forecastFor[i]!).toISOString()),
      enabled: forecastFor[i] != null,
      staleTime: TEN_MIN_MS,
      meta: { silent: true },
    })),
  });
  const windOf = (ident: string): WindPick | null => {
    const i = airports.findIndex((a) => sameField(a.ident, ident));
    const runways = airports[i]?.runways;
    if (!runways) return null;
    const forecast = forecastFor[i] != null ? forecasts[i]?.data : null;
    if (forecast) {
      return windPick(
        runways,
        {
          station: forecast.ident,
          distanceNm: forecast.distance_nm,
          dirTrueDeg: forecast.dir_true_deg,
          speedKt: forecast.speed_kt,
          gustKt: forecast.gust_kt,
        },
        forecastFor[i]! / 1000,
      );
    }
    const card = cards[i]?.data;
    const near = card && !card.metar ? card.nearby_metar : null;
    // The field's own report as well, for what the planner's runway winds
    // cannot say: a variable wind (VRB) has no runway into it there, and
    // was left with none picked (KDLH's VRB04KT, the owner's screenshot).
    const own = card?.metar;
    return windPick(
      runways,
      near
        ? {
            station: near.ident,
            distanceNm: near.distance_nm,
            dirTrueDeg: near.metar.wind_dir_true_deg,
            speedKt: near.metar.wind_speed_kt,
            gustKt: near.metar.wind_gust_kt,
          }
        : own
          ? { station: ident, distanceNm: 0, dirTrueDeg: own.wind_dir_true_deg, speedKt: own.wind_speed_kt, gustKt: own.wind_gust_kt }
          : null,
    );
  };
  // The wind a field reports, else the nearest report's, as the METAR
  // gives it: from true north (FAA Order JO 7900.5), marked "T" beside the
  // runways' magnetic numbers, where a tower's and an ATIS's winds are
  // magnetic (AIM 4-1-13) -- the audit's finding.
  const reportedOf = (ident: string): ReportedWind | null => {
    const i = airports.findIndex((a) => sameField(a.ident, ident));
    // The forecast's, where the runway is picked into it (windOf).
    const forecast = forecastFor[i] != null ? forecasts[i]?.data : null;
    if (forecast) {
      const said = reportedWind(forecast.dir_true_deg, forecast.speed_kt, forecast.gust_kt);
      return said && said !== "calm" ? { ...said, spoken: `forecast for ${zuluTime(new Date(forecastFor[i]!))}, ${said.spoken}` } : said;
    }
    const card = cards[i]?.data;
    const m = card?.metar ?? card?.nearby_metar?.metar;
    return m ? reportedWind(m.wind_dir_true_deg, m.wind_speed_kt, m.wind_gust_kt) : null;
  };
  return { cards, forecastFor, forecasts, startMs, landedAt, windOf, reportedOf };
}
