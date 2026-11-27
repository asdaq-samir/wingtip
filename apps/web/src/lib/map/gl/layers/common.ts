import type { CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import { luminanceOf, scaledHex } from "../../../rgb";
import { CHART, MAP_LABEL, type MapLabelKind } from "../../../tokens";
/** The map's words, in the page's Inter (GlMapShell's font-faces), in
 *  every look: the map's colours are the chart's own, not the look's. */
export const GL_FONT = ["Inter"];
/** The chart's labels in bold, as ForeFlight sets its idents: the same
 *  Inter at weight 700 (GlMapShell's second font-face). */
export const GL_FONT_BOLD = ["Inter Bold"];

/** The map's global state (MapLibre's `global-state`) that says how far
 *  the Map card's Larger Map Labels grows the map's words: 1 off, else
 *  the pilot's text size over 16 px, at most map.label.scale-max (labelScale;
 *  set by ChartGl). Read by every kind's size, so a change is one
 *  setGlobalStateProperty, with no style made again. */
export const LABEL_SCALE = "labelScale";
const SCALE: ExpressionSpecification = ["coalesce", ["global-state", LABEL_SCALE], 1] as unknown as ExpressionSpecification;

/** How far the map's words grow: the pilot's text size over the standard
 *  16 px with Larger Map Labels on, never under 1 nor over scale-max (the
 *  owner, 2026-11-21: his larger text, 1.2 at most so a chart's lettering
 *  stays a chart's); off, 1, as Apple Maps and ForeFlight keep theirs. */
export function labelScale(on: boolean, rootPx: number): number {
  if (!on || !Number.isFinite(rootPx)) return 1;
  return Math.min(MAP_LABEL.scaleMax, Math.max(1, rootPx / 16));
}

/** A label's size by the map's zoom: MapLibre's zooms and the sizes at
 *  them, interpolated between, each times the labels' scale (MapLibre
 *  takes the zoom only as the input of the top interpolate, so the scale
 *  goes in each stop's output). */
function labelByZoom(stops: readonly (readonly [glZoom: number, px: number])[]): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, px]) => [z, ["*", px, SCALE]])] as unknown as ExpressionSpecification;
}

/** The map's global state (MapLibre's `global-state`) that holds the light
 *  the map's light-haloed words take after dark, their night inks' share
 *  (mapDim's wordLight: the paper's luminance under the Dimmer, so no word
 *  is brighter than the chart under it), and 0 by day: set by ChartGl from
 *  the page's dark theme and the Dimmer as committed. One figure for both,
 *  so a theme's change, or a Dimmer's commit at night, is one change of
 *  the state, which the words' colours by feature (a field's tower, a
 *  hazard's own ink) have MapLibre lay their sources out again for. */
export const LABEL_NIGHT = "labelNight";
const LIGHT: ExpressionSpecification = ["number", ["global-state", LABEL_NIGHT], 0];
const NIGHT: ExpressionSpecification = [">", LIGHT, 0];
/** The light halo's colour: the chart's white by day; after dark the
 *  tag's dark, whole, as Apple Maps letters its dark map, light words on a
 *  dark halo (rules.md §13.6; the owner, 2026-11-21). Whole, not at
 *  map.label.halo-night's 0.85 nor faded with the Dimmer: the words were
 *  made see-through with the Dimmer, their halo with them, and read about
 *  2:1 on the halo turned the paper's grey (the themes audit, round 6,
 *  N1); now the words alone are dimmed, by colour (labelInk), and read
 *  4.2:1 or more on it at the night's default Dimmer. One expression, read
 *  by every layer's paint, so the theme's change is one
 *  setGlobalStateProperty. */
const HALO_COLOUR: ExpressionSpecification = ["case", NIGHT, CHART.tag, CHART.casing];
/** The halo round the map's labels: white by day and wide enough to read
 *  on the chart's own ink, dark after dark. */
export const LABEL_HALO = { "text-halo-color": HALO_COLOUR, "text-halo-width": MAP_LABEL.halo } as const;

/** The sRGB power a luminance's share is taken back to an ink's factor by. */
export const ENCODE = 2.2;
/** The night inks' light the words are matched to: the towered field's
 *  blue (map.label.night-ink). */
export const WORD_LIGHT = luminanceOf(MAP_LABEL.nightInk[CHART.towered]!);

/** Each day ink's night ink, a lighter one brought down to WORD_LIGHT
 *  (the fixes' near white, the VFR green, the mountains' grey), so that at
 *  the words' light (LIGHT) every word is as light as the paper under the
 *  Dimmer and none brighter (AIM 8-1-6); one darker kept as it is. */
const NIGHT_INK: Record<string, string> = Object.fromEntries(
  Object.entries(MAP_LABEL.nightInk).map(([day, night]) => [
    day,
    scaledHex(night, Math.min(1, (WORD_LIGHT / luminanceOf(night)) ** (1 / ENCODE))),
  ]),
);

/** A colour at the words' light after dark (LIGHT): black at none, itself
 *  at 1, as mapDim's dimmedColour takes the chart's brightness. */
const atNightLight = (colour: unknown) => ["interpolate", ["linear"], LIGHT, 0, "black", 1, colour];

/** A light-haloed word's ink: its day ink, and after dark that ink's night
 *  one (map.label.night-ink: the field's blue and magenta, the VFR green,
 *  the fixes' dark, the hazards' colours, each lighter, none lighter than
 *  the towered blue: NIGHT_INK) at the words' light, the halo dark under it. A colour is looked up here; an
 *  expression (a match on the field's tower, a hazard's own `ink`) is
 *  matched on what it gives, a colour not in the table keeping its own.
 *  Every layer whose words have the light halo writes its `text-color`
 *  through this, and mapDim leaves its words' opacity whole (wordsDimmed). */
export function labelInk(day: string | ExpressionSpecification): ExpressionSpecification | string {
  const night =
    typeof day === "string"
      ? (NIGHT_INK[day] ?? day)
      : (["match", day, ...Object.entries(NIGHT_INK).flat(), day] as unknown as ExpressionSpecification);
  return ["case", NIGHT, atNightLight(night), day] as unknown as ExpressionSpecification;
}

export type LabelKind = keyof typeof MAP_LABEL.kind;

/** A kind of label's words as design/tokens.json's map.label.kind letters
 *  them: Inter in its weight, at its size, fixed or by zoom (the token's
 *  zooms are the app's levels, glZoom's less one), times the labels' scale
 *  (LABEL_SCALE). Every layer that writes words on the map takes these, so
 *  one kind reads alike wherever it is. */
export function labelText(kind: LabelKind): { "text-font": string[]; "text-size": ExpressionSpecification } {
  const k: MapLabelKind = MAP_LABEL.kind[kind];
  const size =
    typeof k.size === "number"
      ? (["*", k.size, SCALE] as unknown as ExpressionSpecification)
      : labelByZoom(k.size.map(([z, px]) => [z - 1, px] as const));
  return { "text-font": k.bold ? GL_FONT_BOLD : GL_FONT, "text-size": size };
}

/** And its halo: the chart's white round dark or coloured words (the
 *  tag's dark after dark, labelInk's inks on it), the tag's dark round
 *  white ones, or none for words on their own chip, tab or pill, which is
 *  their ground. Each at the one width, map.label.halo. */
export function labelHalo(kind: LabelKind): { "text-halo-color"?: ExpressionSpecification | string; "text-halo-width"?: number } {
  const halo = MAP_LABEL.kind[kind].halo;
  if (halo === "light") return LABEL_HALO;
  if (halo === "dark") return { "text-halo-color": CHART.tag, "text-halo-width": MAP_LABEL.halo };
  return {};
}

/** A tap's reach and order: a mark within a finger's half-width (a 44 pt
 *  target), a line within 10 px; the route's airports
 *  before its checkpoints before anything on the chart under them. */
export const TAP = { mark: 22, line: 10, rank: { field: 0, checkpoint: 1, mark: 2, line: 5, area: 8 } } as const;

/** The one ring round a thing picked, every kind alike (rules.md §14): in
 *  the brand's Taxiway Yellow (CHART.selected, the owner, 2026-11-09 and
 *  2026-11-18: one selection colour), radius 20, cased white, then the
 *  shade's dark edge, so it holds over the sectional's towns, as yellow as
 *  it is (about 1.6:1 there alone), and its pale greens (1.4:1). Its three
 *  layers from `source`, ids `<prefix>-edge`, `<prefix>-casing` and
 *  `<prefix>`, drawn in the `top` slot. */
export function selectionRing(prefix: string, source: string): CircleLayerSpecification[] {
  const ring = (id: string, color: string, width: number): CircleLayerSpecification => ({
    id,
    type: "circle",
    source,
    paint: { "circle-radius": 20, "circle-opacity": 0, "circle-stroke-color": color, "circle-stroke-width": width },
  });
  return [ring(`${prefix}-edge`, `${CHART.shade}8c`, 9), ring(`${prefix}-casing`, CHART.casing, 6), ring(prefix, CHART.selected, 3)];
}
