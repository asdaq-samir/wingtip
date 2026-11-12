import { cn } from "cn";
import { PlaybackButton, PlaybackToolbar, PlayToggle } from "../../components/PlaybackBar";
import { keepSliderKeys } from "../../components/playbackKeys";
import { Slider } from "../../components/ui/slider";
import { clockTime, zoneName, zuluTime } from "../../lib/format/time";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { lookOf } from "./flowLook";
import { nowIndex, useWeatherFlow, type FlowFrame } from "./useWeatherFlow";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** A frame's hour as the bar says it: "Now", or how far ahead or back. */
function hourName(frames: FlowFrame[], i: number): string {
  const now = nowIndex(frames);
  if (i === now) return "Now";
  const hours = Math.round((Date.parse(frames[i]!.valid) - Date.parse(frames[now]!.valid)) / 3_600_000);
  return hours > 0 ? `+${hours} h` : `${hours} h`;
}

/**
 * The flow layer's timeline, a glass card at the map's foot above the
 * sheet, as Apple Weather's map has its own (the owner's screenshot,
 * 2026-11-11): Play, which steps through the forecast hours once; the
 * field's name and the hour shown, in Zulu as reports give it and on this
 * device's clock, with "Forecast" for an hour to come; the scrubber over
 * the hours -- the last one, now, then every second hour to twelve ahead
 * (a time scrubber, the one place a slider is right); and Now. The same
 * playback bar as the radar loop's (components/PlaybackBar).
 */
export function FlowBar() {
  const flow = useWeatherFlow({ drive: true });
  if (flow.field === "off") return null;
  const name = lookOf(flow.field).name;
  const frame = flow.frame;
  const at = frame ? new Date(frame.valid) : null;
  const status = flow.failed
    ? "Model weather isn't available right now"
    : flow.loading
      ? "Fetching model weather…"
      : !flow.frames.length
        ? "No model weather yet"
        : null;
  return (
    <div className="pointer-events-none absolute right-[calc(max(0.5rem,env(safe-area-inset-right))+3.25rem)] bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+0.75rem)] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px)+3.25rem)] z-[1000] flex justify-center">
      <PlaybackToolbar
        label={`${name} timeline`}
        onToggle={() => {
          if (flow.frames.length > 1) flow.toggle();
        }}
        className={cn(GLASS, "pointer-events-auto flex w-[min(100%,26rem)] items-center gap-2 rounded-(--radius-banner) py-1 pr-1 pl-1")}
        data-testid="weather-flow-bar"
      >
        <PlayToggle playing={flow.playing} onToggle={flow.toggle} disabled={flow.frames.length < 2} testId="weather-flow-play" />
        {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the slider's own keys, caught as they bubble so the toolbar's roving focus does not take them too. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1" onKeyDown={keepSliderKeys}>
          {status ? (
            <span className={cn("truncate font-medium", TEXT.detail, flow.failed && "text-destructive-ink")} role="status">
              {status}
            </span>
          ) : (
            <>
              <span className={cn("flex min-w-0 items-baseline gap-1.5", TEXT.note)}>
                <span className="truncate font-semibold">{name}</span>
                {frame && (
                  <span className={cn("ml-auto shrink-0", frame.past ? "text-muted-foreground" : "font-semibold text-tint")}>
                    {frame.past ? hourName(flow.frames, flow.shown) : `Forecast ${hourName(flow.frames, flow.shown)}`}
                  </span>
                )}
              </span>
              <Slider
                min={0}
                max={Math.max(0, flow.frames.length - 1)}
                step={1}
                value={[Math.max(0, flow.shown)]}
                onValueChange={(v) => flow.seek((Array.isArray(v) ? v[0] : v) ?? 0)}
                // The thumb's 44-point reach round its 16, a pseudo-element's.
                thumb={{
                  "aria-label": `${name} hour`,
                  "aria-valuetext": at ? `${zuluTime(at)}, ${hourName(flow.frames, flow.shown)}` : undefined,
                  className: "relative after:absolute after:-inset-3.5 after:content-['']",
                }}
                data-testid="weather-flow-scrubber"
              />
              {at && (
                <span className={cn("flex min-w-0 items-baseline gap-1.5 tabular-nums", TEXT.caption)} data-testid="weather-flow-time">
                  <span className="font-semibold">{zuluTime(at)}</span>
                  <span className="truncate text-muted-foreground">
                    {DAY.format(at)} {clockTime(at)} {zoneName(at)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
        <PlaybackButton
          render={
            <button
              type="button"
              className={cn(
                "relative h-9 shrink-0 rounded-full px-2.5 font-semibold text-tint outline-none after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/8 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                TEXT.detail,
              )}
            />
          }
          onClick={flow.now}
          disabled={flow.frames.length < 2 || (!flow.playing && flow.shown === nowIndex(flow.frames))}
          data-testid="weather-flow-now"
        >
          Now
        </PlaybackButton>
      </PlaybackToolbar>
    </div>
  );
}
