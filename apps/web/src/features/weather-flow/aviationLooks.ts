import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import { mapLevel } from "../../lib/format/figures";
import { rgbOf } from "../../lib/rgb";
import { FLOW, WEATHER } from "../../lib/tokens";
import type { FieldLook } from "./flowLook";

type Stop = FieldLook["ramp"][number];

/** A token's colour at an opacity in 255ths, as weatherlayers-gl takes a
 *  stop: the one the Model Weather looks (flowLook too) build stops with. */
export function tone(hex: string, alpha: number): [number, number, number, number] {
  return [...rgbOf(hex), alpha];
}

/** Which weight class's turbulence thresholds the map says its words by:
 *  AWC's "Light (< 15,500 lbs)" row (aviationweather.gov GFA help), the
 *  airplanes this app plans for; the legend says so, so no airplane is
 *  assumed unsaid (the owner, 2026-11-09). */
const TURBULENCE_CLASS = "light" as const;

type Bands = EngineAnswer<"aviation_grid_bands">;

/** Banded steps, each its colour from its least value to the next's, as
 *  AWC's own maps draw them; clear under the first. */
function steps(froms: number[], colours: string[], alpha: number, top: number): Stop[] {
  const out: Stop[] = [[froms[0]! - 1e-3, tone(colours[0]!, 0)]];
  froms.forEach((from, i) => {
    const next = froms[i + 1] ?? top;
    out.push([from, tone(colours[i]!, alpha)], [next - 1e-3, tone(colours[i]!, alpha)]);
  });
  return out;
}

/** The legend's blocks for banded steps: equal blocks, each word at its
 *  block's middle. */
function blocks(words: string[], colours: string[]) {
  const bar: Stop[] = words.flatMap((_, i): Stop[] => [
    [i, tone(colours[i]!, FLOW.alpha.block)],
    [i + 0.999, tone(colours[i]!, FLOW.alpha.block)],
  ]);
  return { bar, ticks: words.map((word, i) => ({ at: i + 0.5, label: word })) };
}

/**
 * The Aviation Weather Center's fields' looks (the owner, 2026-11-12):
 * its icing severity by its categories and its turbulence by its EDR
 * thresholds (the engine's aviation_grid_bands), each banded as AWC's
 * maps band them; the freezing level and the cloud tops, ft MSL, as
 * ramps. The colours are the map's own tokens.
 */
export function aviationLooks(bands: Bands): Record<"icing" | "turb" | "frzlvl" | "tops", FieldLook> {
  // Icing: categories 1 to 4 (0 is none, clear), each a whole step.
  const icingWords = bands.icing.filter((b) => b.from > 0);
  const icingColours = [WEATHER.flowIcingTrace, WEATHER.flowIcingLight, WEATHER.flowIcingModerate, WEATHER.flowIcingHeavy];
  const icingRamp = steps(
    icingWords.map((b) => b.from - 0.5),
    icingColours,
    FLOW.alpha.icing,
    icingWords[icingWords.length - 1]!.from + 0.5,
  );
  const turbRow = bands.turbulence[TURBULENCE_CLASS];
  const turbColours = [WEATHER.flowTurbLight, WEATHER.flowTurbModerate, WEATHER.flowTurbSevere, WEATHER.flowTurbExtreme];
  const turbRamp = steps(
    turbRow.map((b) => b.from),
    turbColours,
    FLOW.alpha.turb,
    1,
  );
  const level = (ft: number) => (ft <= 0 ? "Sfc" : mapLevel(ft));
  return {
    icing: {
      name: "Icing",
      title: "Icing severity",
      ramp: icingRamp,
      opacity: FLOW.cover.hazard,
      ...blocks(
        icingWords.map((b) => b.word),
        icingColours,
      ),
    },
    turb: {
      name: "Turbulence",
      title: "Turbulence, under 15,500 lb",
      ramp: turbRamp,
      opacity: FLOW.cover.hazard,
      ...blocks(
        turbRow.map((b) => b.word),
        turbColours,
      ),
    },
    frzlvl: {
      name: "Freezing level",
      title: "Freezing level (MSL)",
      ramp: FLOW.ramp.frzlvl,
      bar: FLOW.ramp.frzlvl,
      ticks: [0, 4000, 8000, 12000, 16000].map((at) => ({ at, label: level(at) })),
      opacity: FLOW.cover.wash,
    },
    tops: {
      name: "Cloud tops",
      title: "Cloud tops (MSL)",
      ramp: FLOW.ramp.tops,
      bar: FLOW.ramp.tops,
      ticks: [10000, 20000, 30000, 40000].map((at) => ({ at, label: level(at) })),
      opacity: FLOW.cover.wash,
    },
  };
}

/** A value of AWC's fields in the bubble: what it is, and its figure. */
export function aviationReading(
  field: "icing" | "turb" | "frzlvl" | "tops",
  value: number,
): { over: string | null; figure: string; under: string } {
  if (field === "icing") return { over: null, figure: callEngine("icing_severity", { category: value }) ?? "–", under: "icing" };
  if (field === "turb") {
    const word = callEngine("turbulence_category", { edr: value, weight_class: TURBULENCE_CLASS });
    return { over: `EDR ${value.toFixed(2)}`, figure: word ?? "None", under: "turb" };
  }
  if (field === "frzlvl")
    return value <= 0 ? { over: "Freezing", figure: "Sfc", under: "level" } : { over: "Freezing", figure: mapLevel(value), under: "MSL" };
  return { over: "Tops", figure: mapLevel(value), under: "MSL" };
}
