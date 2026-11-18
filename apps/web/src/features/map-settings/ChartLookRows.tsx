import { ListGroup, ListRow } from "../../components/GroupedList";
import { Slider, THUMB_HIT } from "../../components/ui/slider";
import { CONTRAST_MAX, CONTRAST_MIN, DIM_MAX, LOOK_STEP, sunlightUndims } from "../../lib/map/chartLook";
import { useChartLook } from "../../lib/map/gl/useChartLook";
import { usePreferences } from "../../lib/preferences";

/** A figure in whole percent: "50%", and the contrast's with its sign. */
const percent = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => (Math.round(v * 100) > 0 ? `+${percent(v)}` : percent(v));
const one = (v: number | readonly number[]) => (Array.isArray(v) ? (v[0] ?? 0) : (v as number));

/**
 * The chart's Dimmer and Contrast, under the Look's tiles at their edges as
 * the base map's Strength is under its pictures (the owner, 2026-11-18:
 * "can we have a dimmer and contrast sliders under sunlight and remove it
 * from the appearance?"). Sliders, as a continuous setting is; a discrete
 * one is a menu or a segmented control (docs/design/rules.md). Each the
 * stock Slider as it comes, its thumb a 44-point reach round its 16
 * (THUMB_HIT) and named for its row; set on the chart's layers as it moves
 * (ChartGl, useGlPaint's setPaintProperty), with no style made again.
 *
 * Dimmer: how far the chart's tiles are dimmed, the value kept for the
 * appearance now drawn (lib/prefs chartDim: light and dark each their own),
 * from none to DIM_MAX. Greyed while Sunlight is on by day, when the chart
 * is at full brightness, keeping its value for after; at night it holds in
 * sunlight too (chartBrightness), so it stays enabled, with no note. Contrast: an offset on the
 * look's own contrast (day, night or sunlight), 0 the look as it is.
 */
export default function ChartLookRows() {
  const { night, sunlight, dim, contrast } = useChartLook();
  const setDim = usePreferences((s) => s.setChartDim);
  const setContrast = usePreferences((s) => s.setChartContrast);
  const undimmed = sunlightUndims(sunlight, night);
  return (
    <ListGroup>
      <ListRow title="Dimmer" description={undimmed ? "Full brightness in sunlight" : undefined}>
        <Slider
          className="w-40"
          min={0}
          max={DIM_MAX}
          step={LOOK_STEP}
          value={dim}
          disabled={undimmed}
          onValueChange={(v) => setDim(night ? "dark" : "light", one(v))}
          // Across, its own; up and down, still the sheet's.
          data-base-ui-swipe-ignore="x"
          data-testid="chart-dimmer"
          thumb={{ "aria-label": "Dimmer", getAriaValueText: (_text, v) => percent(v), className: THUMB_HIT }}
        />
      </ListRow>
      <ListRow title="Contrast">
        <Slider
          className="w-40"
          min={CONTRAST_MIN}
          max={CONTRAST_MAX}
          step={LOOK_STEP}
          value={contrast}
          onValueChange={(v) => setContrast(one(v))}
          data-base-ui-swipe-ignore="x"
          data-testid="chart-contrast"
          thumb={{ "aria-label": "Contrast", getAriaValueText: (_text, v) => signed(v), className: THUMB_HIT }}
        />
      </ListRow>
    </ListGroup>
  );
}
