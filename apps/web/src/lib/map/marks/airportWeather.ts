import type { AirportPin } from "../../api/types";
import { callEngine, type EngineAnswer } from "../../engine/engine";
import { reportedDirection, reportedVisibility } from "../../format";
import { barbId } from "./stationModel";

/**
 * A field's weather as the map marks it (the owner's pick, 2026-11-10):
 * the station model's barb and its two lines, whether the barb is drawn
 * zoomed out too and whether it is red, and the words a screen reader
 * says for the mark. What counts -- zoomed out, a barb from 10 kt or a
 * gust, red past the airplane's demonstrated crosswind, the barb's flags,
 * barbs and half-barbs -- is the engine's
 * (wind_arrow, wind_barb; the least crosswind on the field's runways comes
 * worked out by the planner's least_crosswind); how it is written here is
 * the app's.
 */

export type PinWeather = NonNullable<AirportPin["weather"]>;

/** The station model's marks of one field. */
export interface WeatherMarks {
  /** The barb's picture (stationModel's barbId), red where `over`; null
   *  for a variable wind, which has no direction to point it in, or no
   *  wind reported. */
  barb: string | null;
  /** The wind's direction, true, the barb turned by it. */
  dir: number;
  /** The two lines beside the field: visibility and weather, ceiling. */
  lines: string;
  /** Whether the barb (or "VRB05") is drawn zoomed out too, where the
   *  wind earns it (the engine's wind_arrow: 10 kt or more, or gusting). */
  far: boolean;
  over: boolean;
  /** "VRB05": a variable wind, which no barb can point, as the METAR
   *  writes it, beside the field; else "". */
  variable: string;
}

/** A visibility as a METAR writes it: "1/2 SM", "1 5/8 SM", "10 SM",
 *  at the reportable value at or below it (reportedVisibility). */
export function visibilityWords(sm: number): string {
  const [whole, fraction] = reportedVisibility(sm);
  const figure = fraction ? (whole ? `${whole} ${fraction}` : fraction) : String(whole);
  return `${figure} SM`;
}

/** The ceiling as a METAR writes it, its layer's cover and its height in
 *  hundreds of feet AGL in three figures (the station model's, FAA-H-8083-28B
 *  25.2.3.4.6): "OVC 008", "VV 002"; "CIG 008" for a report read before
 *  the cover was kept; "CIG ///" where the lowest broken or overcast layer
 *  came with no height, a ceiling not known (14 CFR 1.1). */
export function ceilingWords(w: PinWeather): string | null {
  if (w.ceiling_unknown) return "CIG ///";
  if (w.ceiling_ft == null) return null;
  return `${w.ceiling_cover ?? "CIG"} ${String(Math.round(w.ceiling_ft / 100)).padStart(3, "0")}`;
}

/** The two lines beside a field: "2 SM BR" and "CIG 008", each left out
 *  where the report has none. */
export function stationLines(w: PinWeather): string {
  const sight = [w.visibility_sm == null ? null : visibilityWords(w.visibility_sm), w.wx || null].filter(Boolean).join(" ");
  return [sight, ceilingWords(w)].filter(Boolean).join("\n");
}

/** The engine's answers for the winds already asked, by what was asked:
 *  each rule is the same answer for the same question, and the map's
 *  thousand METAR fields share a few dozen winds, where each field's marks
 *  were two calls into the .wasm at every rebuild (the speed audit of
 *  2026-11-27). The engine has no many-at-once form of either. Emptied
 *  past MOST, so it never grows without end. */
const arrows = new Map<string, EngineAnswer<"wind_arrow">>();
const barbs = new Map<string, EngineAnswer<"wind_barb">>();
const MOST = 4096;
function remembered<T>(kept: Map<string, T>, key: string, ask: () => T): T {
  const had = kept.get(key);
  if (had !== undefined) return had;
  if (kept.size >= MOST) kept.clear();
  const answer = ask();
  kept.set(key, answer);
  return answer;
}

/** A field's marks from its METAR, the picked airplane's demonstrated
 *  crosswind (null with none picked or no figure: the barb then never
 *  red, nothing assumed). */
export function weatherMarksOf(w: PinWeather, demonstratedKt: number | null): WeatherMarks {
  const arrowAsked = {
    speed_kt: w.wind_speed_kt ?? null,
    gust_kt: w.wind_gust_kt ?? null,
    crosswind_kt: w.crosswind_kt ?? null,
    demonstrated_kt: demonstratedKt,
  };
  const shown = remembered(arrows, JSON.stringify(arrowAsked), () => callEngine("wind_arrow", arrowAsked));
  const directed = w.wind_dir_true_deg != null;
  const speed = w.wind_speed_kt;
  const drawn = speed == null ? null : remembered(barbs, String(speed), () => callEngine("wind_barb", { speed_kt: speed }));
  // Calm needs no direction; any other barb does, so a VRB wind is written.
  const barb = drawn && (drawn.calm || directed) ? barbId(drawn, shown.over) : null;
  const variable = drawn && !barb ? `VRB${String(Math.round(w.wind_speed_kt ?? 0)).padStart(2, "0")}` : "";
  return { barb, dir: w.wind_dir_true_deg ?? 0, lines: stationLines(w), far: shown.shown && drawn !== null, over: shown.over, variable };
}

/** What a screen reader says for a field's mark: "KJVL, IFR, wind 220 at
 *  18 gusting 26". */
export function spokenWeather(ident: string, category: string | null | undefined, w: PinWeather | null | undefined): string {
  const parts = [ident];
  if (category) parts.push(category);
  if (w?.wind_speed_kt != null) {
    if (w.wind_speed_kt === 0) parts.push("wind calm");
    else {
      const from = w.wind_dir_true_deg == null ? "variable" : reportedDirection(w.wind_dir_true_deg);
      const gust = w.wind_gust_kt != null && w.wind_gust_kt > w.wind_speed_kt ? ` gusting ${Math.round(w.wind_gust_kt)}` : "";
      parts.push(`wind ${from} at ${Math.round(w.wind_speed_kt)}${gust}`);
    }
  }
  return parts.join(", ");
}
