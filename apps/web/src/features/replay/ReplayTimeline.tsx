import type { ReactNode } from "react";
import { Square } from "lucide-react";
import { cn } from "cn";
import RoundButton from "../../components/RoundButton";
import { PlaybackButton, PlaybackToolbar, PlayToggle, SpeedMenu } from "../../components/PlaybackBar";
import { keepSliderKeys } from "../../components/playbackKeys";
import { Slider } from "../../components/ui/slider";
import { TEXT } from "../../lib/text";
import { replayTimes } from "./replayTime";
import { speedName, useReplay } from "./useReplay";

/**
 * A replay's timeline, one for every replay that plays on the map's
 * clock (useReplay): Play, how fast (a menu, decision 0017), and the
 * stock Slider over the flight's time, its keys and VoiceOver Base UI's
 * (the APG slider), Space playing or pausing from it as from the bar
 * (components/PlaybackBar, the radar loop's and the dry run's parts too).
 * The moment in Zulu, as reports give it, and on this device's clock. The
 * gaps -- no report heard -- shaded on the track, so a scrub into one is
 * seen to be one.
 *
 * TODO(claude/studio): the weather flow's FlowBar (features/weather-flow)
 * to take its Slider and readout from here once its Card rework lands;
 * the dry run's distance scrubber (DryRunControls) too, its x being miles
 * along the course rather than seconds.
 */
export function ReplayTimeline({
  label,
  speeds,
  gaps = [],
  onStop,
  testId,
  className,
  children,
}: {
  label: string;
  speeds: readonly number[];
  gaps?: { from: number; to: number }[];
  /** A Stop, back to before it was played (a past flight's card). */
  onStop?: () => void;
  testId: string;
  className?: string;
  /** More of the bar's parts after the speed, in its roving focus: the
   *  camera's menu (CameraMenu). */
  children?: ReactNode;
}) {
  const replay = useReplay();
  const { start, end } = replay;
  const shown = replay.second ?? start;
  const times = shown === null ? null : replayTimes(shown);
  const span = start !== null && end !== null ? Math.max(1, end - start) : 1;
  const place = (t: number) => `calc(0.5rem + ${(t - (start ?? 0)) / span} * (100% - 1rem))`;
  return (
    <PlaybackToolbar
      label={label}
      onToggle={() => replay.ready && replay.toggle()}
      className={cn("flex flex-col gap-1.5", className)}
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <PlayToggle playing={replay.playing} onToggle={replay.toggle} disabled={!replay.ready} testId={`${testId}-play`} />
        {onStop && (
          <PlaybackButton
            render={
              <RoundButton label="Stop" onClick={onStop} disabled={replay.second === null} data-testid={`${testId}-stop`}>
                <Square className="size-5" aria-hidden />
              </RoundButton>
            }
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col tabular-nums" data-testid={`${testId}-time`}>
          <span className={cn("truncate font-semibold", TEXT.row)}>{times ? times.zulu : "—"}</span>
          <span className={cn("truncate text-muted-foreground", TEXT.caption)}>{times ? times.local : ""}</span>
        </span>
        <SpeedMenu
          name="Speed"
          value={replay.speed}
          choices={speeds.map((x) => ({ value: x, label: speedName(x) }))}
          onPick={replay.setSpeed}
          testId={`${testId}-speed`}
        />
        {children}
      </div>
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the slider's own keys, caught as they bubble so the toolbar's roving focus does not take them too. */}
      <div className="relative" onKeyDown={keepSliderKeys}>
        <Slider
          min={start ?? 0}
          max={end ?? 1}
          step={1}
          largeStep={60}
          disabled={!replay.ready}
          value={[shown ?? 0]}
          onValueChange={(v) => {
            const t = Array.isArray(v) ? v[0] : v;
            if (t !== undefined) replay.seek(t);
          }}
          className="[&_[data-slot=slider-track]]:h-2"
          thumb={{
            "aria-label": `Where the ${label.toLowerCase()} is`,
            "aria-valuetext": times ? `${times.zulu}, ${times.local}` : undefined,
            className: "relative after:absolute after:-inset-3.5 after:content-['']",
          }}
          data-testid={`${testId}-scrub`}
        />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {start !== null &&
            gaps.map((g) => (
              <span
                key={g.from}
                className="absolute top-1/2 h-2 -translate-y-1/2 bg-muted-foreground/50"
                style={{ left: place(g.from), width: `calc(${(g.to - g.from) / span} * (100% - 1rem))` }}
              />
            ))}
        </div>
      </div>
    </PlaybackToolbar>
  );
}
