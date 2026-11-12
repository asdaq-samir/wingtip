import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import MenuPick from "../../components/MenuPick";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { GLASS, GLASS_CARD } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { levelName, levelsOf } from "./flowLevels";
import { FIELDS, lookOf, rampGradient, tickPlace, type ShownField } from "./flowLook";
import { sourceLine } from "./flowSource";
import type { FlowFrame, FlowLayer } from "./useWeatherFlow";

/**
 * The flow layer's controls and legend at the map's top left, as Apple
 * Weather's map has them (the owner's screenshots, 2026-11-12): Close, its
 * own round pane of glass, which turns the layer off; beside it the field,
 * a menu of the others on a glass pill (the layers button's menu in
 * Apple's, which sits at its top right; ours stays a menu here, as the
 * map's own buttons keep their places); and under them a narrow card --
 * the field and its unit, a slim bar of the colour ramp with its marks
 * (knots, degrees, or for precipitation, the ceiling and CAPE their bands'
 * words, the engine's), and small, whose the picture is (sourceLine). Where
 * the field has levels, a menu of them beside the field's.
 */
export function FlowLegend({
  field,
  file,
  level,
  layer,
  frame,
  radar,
  world,
}: {
  field: ShownField;
  /** The picture shown (flowLevels' fileOf). */
  file: string;
  level: string | null;
  layer: FlowLayer | null;
  frame: FlowFrame | null;
  radar: boolean;
  /** Whether the GFS's world wind is drawn too, zoomed out. */
  world: boolean;
}) {
  const set = useWeatherLayers((s) => s.set);
  const look = lookOf(field);
  const levels = levelsOf(layer, field).map((value) => ({ value, label: levelName(value) }));
  const source = sourceLine(frame, file, radar, world);
  return (
    <div className="pointer-events-none absolute top-[max(0.5rem,env(safe-area-inset-top))] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px))] z-[1000] flex flex-col items-start gap-2">
      <div className="pointer-events-auto flex items-center gap-2">
        <span className={cn(GLASS, "rounded-full p-1")}>
          <CloseButton
            label="Turn off model weather"
            onClick={() => set({ flow: "off" })}
            className="bg-transparent"
            data-testid="weather-flow-close"
          />
        </span>
        <span className={cn(GLASS, "rounded-full p-1")}>
          <MenuPick
            name="Weather on the map"
            value={field}
            choices={FIELDS}
            onPick={(v) => set({ flow: v })}
            testId="weather-flow-legend-field"
          />
        </span>
        {level !== null && levels.length > 1 && (
          // The level, a menu as AWC's own picker's levels are a list
          // (Sfc, 060 ... Max; the owner's screenshot, 2026-11-12), not a
          // slider: a discrete setting (the owner's rule).
          <span className={cn(GLASS, "rounded-full p-1")}>
            <MenuPick name="Level" value={level} choices={levels} onPick={(v) => set({ flowLevel: v })} testId="weather-flow-level" />
          </span>
        )}
      </div>
      {/* The stock Card in the map's glass, its parts as they come; the
          card's own spacing is set off so the narrow legend keeps its size. */}
      <Card
        role="region"
        aria-label={`${look.name} legend`}
        data-testid="weather-flow-legend"
        className={cn(GLASS_CARD, "pointer-events-auto w-32 gap-0 rounded-(--radius-card) border-0 py-0 shadow-(--depth-float)")}
      >
        <CardHeader className="grid-rows-1 gap-0 border-b border-foreground/10 px-3 py-2 [.border-b]:pb-2">
          <CardTitle className={TEXT.note}>{look.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-28 gap-2 px-3 py-3">
          <div className="w-1 rounded-full" style={{ background: rampGradient(look.bar) }} aria-hidden="true" />
          <ol className="relative flex-1" aria-label={look.title}>
            {look.ticks.map((t) => (
              <li
                key={t.label}
                className={cn("absolute -translate-y-1/2 whitespace-nowrap text-muted-foreground tabular-nums", TEXT.caption)}
                style={{ top: `${tickPlace(look.bar, t.at) * 100}%` }}
              >
                {t.label}
              </li>
            ))}
          </ol>
        </CardContent>
        <CardFooter
          className={cn("block px-3 pb-2 text-pretty", source.stale ? "text-caution-ink" : "text-muted-foreground", TEXT.caption)}
          data-testid="weather-flow-source"
          data-stale={source.stale || undefined}
        >
          {source.text}
        </CardFooter>
      </Card>
    </div>
  );
}
