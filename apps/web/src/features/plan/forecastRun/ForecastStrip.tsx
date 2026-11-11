import { CloudSun, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { PlaybackToggle } from "../../../components/PlaybackBar";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { describeError } from "../../../lib/api/client";
import type { ForecastRun } from "../../../lib/api/types";
import { grouped, threeFigures } from "../../../lib/format";
import { TEXT } from "../../../lib/text";
import { CATEGORY_CHIP, CATEGORY_UNKNOWN } from "../../../lib/tokens";
import type { DryRun } from "../components/navlog/dryRun";
import type { RouteEnds } from "../components/navlog/rows";
import { hourZ, unavailableWords, zulu } from "./forecastRun";
import { setForecastMode, useForecastMode, useForecastRun } from "./useForecastRun";

/** Forecast mode's switch, among the dry run's own controls: the run
 *  played against the forecast for the hours it flies, or not -- the
 *  playback bar's stock toggle (PlaybackToggle). */
export function ForecastToggle() {
  const on = useForecastMode((s) => s.on);
  return (
    <PlaybackToggle pressed={on} onPressedChange={setForecastMode} label="Forecast mode" testId="dry-run-forecast">
      <CloudSun className="size-5" aria-hidden />
    </PlaybackToggle>
  );
}

/**
 * The dry run against the forecast, under its chart while forecast mode is
 * on (owner, 2026-11-09): a strip of the legs in time, each the worst
 * flight category forecast along it in the category's colour and the hour
 * it starts, the moment marked; what the airplane meets now; and the
 * latest alert it has reached, cited -- where the run would enter
 * forecast weather under 14 CFR 91.155's minimums or the pilot's own, or
 * an advisory area. Warned, never stopped: the run plays on.
 */
export function ForecastStrip({ run, ends }: { run: DryRun; ends: RouteEnds | null }) {
  const vm = useForecastRun(run, ends);
  if (!vm.on) return null;
  if (vm.error) {
    return (
      <p className={cn("px-2 pt-1 text-destructive", TEXT.note)} data-testid="forecast-run-error">
        The forecast for the run couldn't be had: {describeError(vm.error)}
      </p>
    );
  }
  if (!vm.answer) {
    return (
      <p className={cn("px-2 pt-1 text-muted-foreground", TEXT.note)} data-testid="forecast-run-loading">
        Fetching the forecast for the run…
      </p>
    );
  }
  const alert = vm.alerts[0];
  const missing = unavailableWords(vm.answer.unavailable);
  return (
    <div className="flex flex-col gap-1 px-2 pt-1" data-testid="forecast-run">
      <Legs answer={vm.answer} now={vm.now} />
      {vm.here && <Here here={vm.here} />}
      {alert && (
        // The stock Alert, in the caution's wash: warned, never stopped.
        <Alert className={cn("border-0 bg-caution-wash px-2 py-1", TEXT.note)} data-testid="forecast-run-alert">
          <TriangleAlert aria-hidden="true" className="text-caution-ink" />
          <AlertTitle className="font-normal">{alert.words}</AlertTitle>
          <AlertDescription className={TEXT.caption}>Source: {alert.source}</AlertDescription>
        </Alert>
      )}
      {missing && <p className={cn("text-muted-foreground", TEXT.caption)}>{missing}</p>}
    </div>
  );
}

/** The legs in time, each as long as it is flown. */
function Legs({ answer, now }: { answer: ForecastRun; now: number }) {
  const { legs } = answer;
  if (!legs.length) return null;
  const start = legs[0]!.from_t,
    end = Math.max(legs.at(-1)!.to_t, start + 1);
  const mark = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return (
    <div className="relative flex h-6 overflow-hidden rounded-md" data-testid="forecast-run-legs">
      {legs.map((leg) => (
        <div
          key={`${leg.row}-${leg.from_t}`}
          className={cn("flex min-w-0 items-center justify-center border-r border-background/60 text-white", TEXT.caption)}
          style={{
            flexGrow: Math.max(leg.to_t - leg.from_t, 60),
            background: (leg.category && CATEGORY_CHIP[leg.category]) || CATEGORY_UNKNOWN,
          }}
          data-category={leg.category ?? "unknown"}
        >
          <span className="truncate px-1 font-semibold tabular-nums">
            {hourZ(leg.from_t)} {leg.category ?? "—"}
          </span>
        </div>
      ))}
      <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${mark * 100}%` }} />
    </div>
  );
}

/** What the airplane meets where it is now: the category, ceiling,
 *  visibility and wind aloft forecast for then, and whose forecast it is. */
function Here({ here }: { here: ForecastRun["samples"][number] }) {
  const ceiling = here.ceiling_unknown
    ? "ceiling not known"
    : here.ceiling_ft != null
      ? `ceiling ${grouped(here.ceiling_ft)} ft`
      : "no ceiling";
  const visibility = here.visibility_sm != null ? `${here.visibility_sm} sm` : "visibility not known";
  const wind =
    here.wind_speed_kt != null && here.wind_dir_true_deg != null
      ? `wind ${threeFigures(here.wind_dir_true_deg)}° ${Math.round(here.wind_speed_kt)} kt`
      : "wind aloft not known";
  return (
    <p className={cn("text-foreground", TEXT.caption)} data-testid="forecast-run-here">
      <span className="font-semibold">
        {zulu(here.t)} {here.category ?? "Category not known"}
      </span>
      {` · ${ceiling} · ${visibility} · ${wind}`}
      {here.source && <span className="text-muted-foreground"> · {here.source}</span>}
    </p>
  );
}
