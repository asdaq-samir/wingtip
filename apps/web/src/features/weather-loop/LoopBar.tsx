import { useEffect, useState, type PointerEvent } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { PlaybackButton, PlaybackToolbar, PlayToggle } from "../../components/PlaybackBar";
import { keepSliderKeys } from "../../components/playbackKeys";
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
 *
 * The map's one playback bar (components/PlaybackBar, the dry run's too):
 * Play at its start, a stock toggle; the scrubber, whose arrows step a
 * frame and Home and End go to the oldest and the newest (the APG
 * slider's keys, Windy's and the GFA's ← and →); Now at its end, the
 * newest frame; Space plays or pauses from anywhere on the bar.
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
  // A mouse over the scrubber: the frame under it shown on the map and its
  // time said here, as long as it rests there (docs/design/web.md §7).
  const peeked = loop.showing !== loop.shown ? loop.frames[loop.showing] : undefined;
  const peekTime = peeked ? frameTime(peeked.valid, now, loop.oldAfterS) : null;
  const peekOver = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || loop.frames.length < 2 || !loop.ready) return;
    const box = e.currentTarget.getBoundingClientRect();
    const at = Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(1, box.width)));
    loop.peekAt(Math.round(at * (loop.frames.length - 1)));
  };
  const shownTime = peekTime ?? time;
  const status = loop.failed
    ? `${name} isn't available right now`
    : loop.loading
      ? `Fetching ${name.toLowerCase()}…`
      : !loop.frames.length
        ? `No ${name.toLowerCase()} frames yet`
        : null;
  return (
    <PlaybackToolbar
      label={`${name} loop`}
      onToggle={() => {
        if (loop.frames.length > 1) loop.toggle();
      }}
      className={cn(GLASS, "pointer-events-auto flex w-[min(100%,24rem)] items-center gap-2 rounded-(--radius-banner) py-1 pr-1 pl-1")}
      data-testid="weather-loop-bar"
    >
      <PlayToggle playing={loop.playing} onToggle={loop.toggle} disabled={loop.frames.length < 2} testId="weather-loop-play" />
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the slider's own keys, caught as they bubble so the toolbar's roving focus does not take them too. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1" onKeyDown={keepSliderKeys}>
        {status ? (
          <span className={cn("truncate font-medium", TEXT.detail, loop.failed && "text-destructive-ink")} role="status">
            {status}
          </span>
        ) : (
          <>
            {/* A mouse's hover only: the slider's own keys and taps are untouched. */}
            <div onPointerMove={peekOver} onPointerLeave={() => loop.peekAt(null)} data-testid="weather-loop-peek">
              <Slider
                min={0}
                max={Math.max(0, loop.frames.length - 1)}
                step={1}
                value={[Math.max(0, loop.shown)]}
                onValueChange={(v) => loop.seek((Array.isArray(v) ? v[0] : v) ?? 0)}
                // Live while the frames' tiles still load: a key or a tap
                // then moves the frame (and the loop no longer plays by
                // itself), where a scrubber disabled until they were in
                // dropped it.
                disabled={loop.frames.length < 2}
                // The thumb's 44-point reach round its 16, a pseudo-element's.
                thumb={{
                  "aria-label": `${name} frame`,
                  "aria-valuetext": time ? `${time.zulu}, ${time.age}` : undefined,
                  className: "relative after:absolute after:-inset-3.5 after:content-['']",
                }}
                data-testid="weather-loop-scrubber"
              />
            </div>
            {shownTime && (
              <span className={cn("flex min-w-0 items-baseline gap-1.5 tabular-nums", TEXT.note)} data-testid="weather-loop-time">
                <span className={cn("font-semibold", peekTime && "text-tint")}>{shownTime.zulu}</span>
                <span className="truncate text-muted-foreground">{shownTime.local}</span>
                <span className={cn("ml-auto shrink-0", shownTime.old ? "font-semibold text-destructive-ink" : "text-muted-foreground")}>
                  {shownTime.old ? `Old: ${shownTime.age}` : shownTime.age}
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
      {/* The newest frame, from wherever the loop is (the GFA's Now). */}
      <PlaybackButton
        render={
          <Button
            variant="ghost"
            size="inline"
            type="button"
            className={cn(
              "justify-start text-inherit hover:bg-transparent",
              "relative h-9 shrink-0 rounded-full px-2.5 font-semibold text-tint outline-none after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/8 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              TEXT.detail,
            )}
          />
        }
        onClick={loop.now}
        disabled={loop.frames.length < 2 || (!loop.playing && loop.shown === loop.frames.length - 1)}
        data-testid="weather-loop-now"
      >
        Now
      </PlaybackButton>
    </PlaybackToolbar>
  );
}
