import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import MenuPick from "../../components/MenuPick";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { FIELDS, lookOf, rampGradient, tickPlace, type ShownField } from "./flowLook";
import type { FlowFrame } from "./useWeatherFlow";

/**
 * The flow layer's legend, a glass card at the map's top left as Apple
 * Weather's is (the owner's screenshots, 2026-11-11): Close, which turns
 * the layer off; the field, a menu of the others (the layers button's
 * menu in Apple's); its unit; a slim bar of the colour ramp with its
 * marks -- knots, degrees, or for precipitation, the ceiling and CAPE
 * their bands' words, the engine's --
 * and whose the picture is: the model's forecast, which is not an
 * observation, or for an hour past the radar's.
 */
export function FlowLegend({ field, frame, radar }: { field: ShownField; frame: FlowFrame | null; radar: boolean }) {
  const set = useWeatherLayers((s) => s.set);
  const look = lookOf(field);
  return (
    <section
      aria-label={`${look.name} legend`}
      data-testid="weather-flow-legend"
      className={cn(
        GLASS,
        "absolute top-[max(0.5rem,env(safe-area-inset-top))] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px))] z-[1000] flex w-44 flex-col gap-2 rounded-(--radius-card) p-2",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <MenuPick
          name="Weather on the map"
          value={field}
          choices={FIELDS}
          onPick={(v) => set({ flow: v })}
          testId="weather-flow-legend-field"
        />
        <CloseButton label="Turn off model weather" onClick={() => set({ flow: "off" })} data-testid="weather-flow-close" />
      </div>
      <p className={cn("font-semibold", TEXT.note)}>{look.title}</p>
      <div className="flex h-32 gap-2">
        <div className="w-2 rounded-full" style={{ background: rampGradient(look.bar) }} aria-hidden="true" />
        <ol className="relative flex-1" aria-label={look.title}>
          {look.ticks.map((t) => (
            <li
              key={t.label}
              className={cn("absolute -translate-y-1/2 tabular-nums", TEXT.caption)}
              style={{ top: `${tickPlace(look.bar, t.at) * 100}%` }}
            >
              {t.label}
            </li>
          ))}
        </ol>
      </div>
      <p className={cn("text-muted-foreground", TEXT.caption)} data-testid="weather-flow-source">
        {radar ? "Radar, observed" : `Model forecast, not an observation${frame ? ` (${frame.model})` : ""}`}
      </p>
    </section>
  );
}
