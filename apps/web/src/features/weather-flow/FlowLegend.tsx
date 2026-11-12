import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import MenuPick from "../../components/MenuPick";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { FIELDS, lookOf, rampGradient, tickPlace, type ShownField } from "./flowLook";
import type { FlowFrame } from "./useWeatherFlow";

/**
 * The flow layer's controls and legend at the map's top left, as Apple
 * Weather's map has them (the owner's screenshots, 2026-11-12): Close, its
 * own round pane of glass, which turns the layer off; beside it the field,
 * a menu of the others on a glass pill (the layers button's menu in
 * Apple's, which sits at its top right; ours stays a menu here, as the
 * map's own buttons keep their places); and under them a narrow card --
 * the field and its unit, a slim bar of the colour ramp with its marks
 * (knots, degrees, or for precipitation, the ceiling and CAPE their bands'
 * words, the engine's), and small, whose the picture is: the model's
 * forecast, which is not an observation, or for an hour past the radar's.
 */
export function FlowLegend({ field, frame, radar }: { field: ShownField; frame: FlowFrame | null; radar: boolean }) {
  const set = useWeatherLayers((s) => s.set);
  const look = lookOf(field);
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
      </div>
      <section
        aria-label={`${look.name} legend`}
        data-testid="weather-flow-legend"
        className={cn(GLASS, "pointer-events-auto flex w-32 flex-col rounded-(--radius-card)")}
      >
        <p className={cn("border-b border-foreground/10 px-3 py-2 font-semibold", TEXT.note)}>{look.title}</p>
        <div className="flex h-28 gap-2 px-3 py-3">
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
        </div>
        <p className={cn("px-3 pb-2 text-muted-foreground", TEXT.caption)} data-testid="weather-flow-source">
          {radar ? "Radar, observed" : `Model forecast, not an observation${frame ? ` (${frame.model})` : ""}`}
        </p>
      </section>
    </div>
  );
}
