import type { Briefing, Course, Leg } from "../../lib/api/types";
import { fieldPhases, navLogRows, routeAdiz, routeJurisdiction, windLine, windText, runwayNumber, type useLoad } from "../plan";
import { fieldCategory } from "../../lib/fieldWeather";
import { worstOf } from "../../lib/findings";
import type { VerdictItem } from "../../lib/verdict";
import type { BriefGlance, FieldGlance } from "./glance";
import { adverseRows } from "./adverse";
import { WEATHER_SOURCE_LABEL } from "./briefingFigures";
import type { runwayChecks } from "./runwayCheck";

interface GlanceInputs {
  briefing: Briefing | null;
  course: Course | null;
  legs: Leg[];
  landings: string[];
  dep: string;
  dest: string;
  /** When the flight leaves, and how long it takes, for the arrival's time. */
  leaving: Date;
  eteMin: number | null;
  checks: ReturnType<typeof runwayChecks>;
  picks: Parameters<typeof fieldPhases>[5];
  ownCallSign: Parameters<typeof fieldPhases>[4];
  items: VerdictItem[];
  leastMarginGal: number | null;
  loaded: ReturnType<typeof useLoad>["result"];
  /** The first stretch's wind aloft (windStretches). */
  wind: { dir: number; speed: number } | null | undefined;
}

/** The Brief's glance (features/brief/glance): each part of the flight in a few
 *  figures, from what the pages say -- the runway checks, the radio's
 *  first call, the forecast at each field and along the way. */
export function buildGlance({
  briefing,
  course,
  legs,
  landings,
  dep,
  dest,
  leaving,
  eteMin,
  checks,
  picks,
  ownCallSign,
  items,
  leastMarginGal,
  loaded,
  wind,
}: GlanceInputs): BriefGlance {
  const fieldAt = (ident: string, kind: "departure" | "arrival", at: Date | null): FieldGlance => {
    const check = checks.find((c) => c.field.ident === ident && (kind === "departure" ? c.role === "Departure" : c.role === "Destination"));
    const distance = check?.distances.find((d) => d.kind === (kind === "departure" ? "takeoff" : "landing"));
    const metar = briefing?.metars[ident];
    const phase = briefing ? fieldPhases(briefing, landings, legs, ownCallSign, ident, picks).find((p) => p.kind === kind) : undefined;
    const call = phase?.calls.find((c) => c.mhz != null);
    return {
      ident,
      category: briefing && course ? fieldCategory(briefing, course, ident) : null,
      at: at ? at.toISOString() : null,
      runway: check?.end ? runwayNumber(check.end) : null,
      runwayFt: check?.runway?.length_ft ?? null,
      overFiftyFt: distance ? Math.round(distance.totalFt) : null,
      wind: metar && metar.wind_speed_kt != null ? windLine(metar) : null,
      crosswindKt: check ? Math.round(check.crosswindKt) : null,
      crosswindOver: !!check?.crosswindOver,
      radio: call ? { to: call.to, mhz: call.mhz! } : null,
      // A field not checked (no elevation, no runway length) is not known, never fine; one past
      // the POH's tables is a caution (the engine's runways finding says the same).
      finding:
        !check || check.unchecked || !distance || distance.unknown
          ? "unknown"
          : distance.over
            ? "stop"
            : check.crosswindOver || distance.beyond
              ? "caution"
              : "ok",
    };
  };
  const byKey = (keys: VerdictItem["key"][]) => worstOf(items.filter((i) => keys.includes(i.key)).map((i) => i.finding));
  return {
    before: {
      spareGal: leastMarginGal,
      balance: loaded ? { within: loaded.problems.length === 0, problem: loaded.problems[0] ?? null } : null,
      finding: byKey(["risk", "fuel", "balance", "airspace"]),
    },
    depart: course ? fieldAt(dep, "departure", leaving) : null,
    enroute: {
      ceilingFt: briefing?.forecast.min_ceiling_ft ?? null,
      visibilitySm: briefing?.forecast.min_visibility_sm ?? null,
      wind: wind ? windText(wind.dir, wind.speed, null, "T") : null,
      eteMin,
      line: items.find((i) => i.key === "weather")?.detail ?? null,
      finding: byKey(["weather", "altitude"]),
    },
    arrive: course ? fieldAt(dest, "arrival", eteMin != null ? new Date(leaving.getTime() + eteMin * 60_000) : null) : null,
    // The route's points and its legs between, every 2 nm (the engine's).
    outside: course ? (routeJurisdiction(navLogRows(course, [], legs))?.brief ?? null) : null,
    // And the ADIZs it meets on the way (14 CFR part 99).
    adiz: course ? (routeAdiz(navLogRows(course, [], legs))?.brief ?? null) : null,
    adverse: adverseRows(briefing),
    unchecked: (briefing?.weather_unavailable ?? []).map((source) => WEATHER_SOURCE_LABEL[source]),
    // The reports as sent, for a finding's sources under its line.
    raw: {
      metars: landings.flatMap((i) => (briefing?.metars[i]?.raw ? [{ ident: i, raw: briefing.metars[i]!.raw! }] : [])),
      tafs: landings.flatMap((i) => {
        const st = briefing?.forecast.stations.find((s) => s.icaoId === i);
        return st?.raw ? [{ ident: i, raw: st.raw }] : [];
      }),
      tfrs: (briefing?.tfrs ?? []).map((t) => [t.notam_id, t.title].filter(Boolean).join(" · ")),
    },
  };
}
