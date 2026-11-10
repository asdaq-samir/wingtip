import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import RoundButton from "../../components/RoundButton";
import { Slider } from "../../components/ui/slider";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { frameTime } from "./loopFrames";
import KeptAge from "../../components/KeptAge";
import { useWeatherLoop } from "./useWeatherLoop";

/** What each loop is called on the bar. */
const NAMES = { radar: "Radar", ir: "Satellite IR", visible: "Satellite visible", both: "Radar and IR" } as const;

/** The age is said again each half minute, as the frame grows older. */
const TICK_MS = 30_000;

/**
 * The loop's bar over the map (MapBanners' column), only while a loop is
 * on: play or pause, the scrubber -- a time scrubber is the one place a
 * slider is right, the owner's rule for discrete settings aside -- and
 * the frame's time in Zulu and on this device's clock, with its age, said
 * plainly as old once it is past the source's own pace. Loading and
 * failing are said here too, where the loop is (lib/problems' rule).
 * Runs the loop's clock (useWeatherLoop's `drive`).
 */
export function LoopBar() {
  const loop = useWeatherLoop({ drive: true });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  if (loop.kind === "off") return null;
  const name = NAMES[loop.kind];
  const time = loop.frame ? frameTime(loop.frame.valid, now, loop.oldAfterS) : null;
  const status = loop.failed
    ? `${name} isn't available right now`
    : loop.loading
      ? `Fetching ${name.toLowerCase()}…`
      : !loop.frames.length
        ? `No ${name.toLowerCase()} frames yet`
        : null;
  return (
    <div
      className={cn(GLASS, "pointer-events-auto flex w-[min(100%,24rem)] items-center gap-2 rounded-(--radius-banner) py-1 pr-3 pl-1")}
      data-testid="weather-loop-bar"
      role="group"
      aria-label={`${name} loop`}
    >
      <RoundButton
        label={loop.playing ? "Pause" : "Play"}
        onClick={loop.toggle}
        disabled={loop.frames.length < 2}
        data-testid="weather-loop-play"
      >
        {loop.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </RoundButton>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        {status ? (
          <span className={cn("truncate font-medium", TEXT.detail, loop.failed && "text-destructive-ink")} role="status">
            {status}
          </span>
        ) : (
          <>
            <Slider
              min={0}
              max={Math.max(0, loop.frames.length - 1)}
              step={1}
              value={[Math.max(0, loop.shown)]}
              onValueChange={(v) => loop.seek((Array.isArray(v) ? v[0] : v) ?? 0)}
              disabled={!loop.ready}
              // The thumb's 44-point reach round its 16, a pseudo-element's.
              thumb={{
                "aria-label": `${name} frame`,
                "aria-valuetext": time ? `${time.zulu}, ${time.age}` : undefined,
                className: "relative after:absolute after:-inset-3.5 after:content-['']",
              }}
              data-testid="weather-loop-scrubber"
            />
            {time && (
              <span className={cn("flex min-w-0 items-baseline gap-1.5 tabular-nums", TEXT.note)} data-testid="weather-loop-time">
                <span className="font-semibold">{time.zulu}</span>
                <span className="truncate text-muted-foreground">{time.local}</span>
                <span className={cn("ml-auto shrink-0", time.old ? "font-semibold text-destructive-ink" : "text-muted-foreground")}>
                  {time.old ? `Old: ${time.age}` : time.age}
                </span>
              </span>
            )}
            {/* The frame list kept on this device, with its age, where no
                signal asked it again (lib/kept). */}
            <KeptAge
              kind="weather_loop"
              path="/api/planner/weather/loop"
              atMs={loop.fetchedAt}
              failed={loop.refreshFailed}
              className="truncate"
            />
          </>
        )}
      </div>
    </div>
  );
}
